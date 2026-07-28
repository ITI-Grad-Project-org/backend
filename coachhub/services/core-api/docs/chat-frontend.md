# Chat — Frontend Integration

Real-time coach ↔ client messaging over **Socket.IO**, backed by REST for history
and offline fallback. Everything below is verified end to end against the running
service.

- **A conversation is the `(tenant, client)` pair.** The coach owns the tenant;
  the client belongs to it. There is no separate "conversation id" — you address
  a thread by the **client's id** (the coach names the client; a client is always
  in its own thread).
- **Chat is only available once the coaching relationship is confirmed** — the
  membership must be `active` (or `paused`). `invited` / `requested` / `rejected`
  are rejected with `403` (REST) or a negative ack (WS).
- A client is scoped to **its own** thread and the coach it is currently training
  with (its token's tenant). A coach is scoped to **its own** tenant.

---

## 1. Connecting

Socket.IO, namespace **`/chat`**. Authenticate with the **same access token** you
use for REST — the server tells coach (`tenant-user`) and client apart from the
token itself, so there is **one** connection style for both.

```js
import { io } from 'socket.io-client';

const socket = io(`${API_BASE_URL}/chat`, {
  auth: { token: accessToken }, // preferred
  transports: ['websocket'],
  reconnection: true,
});
```

The token is read from `auth.token`, falling back to the `Authorization` header or
a `?token=` query param. A missing/invalid/expired token, or a client with no
confirmed coach, gets an `error` event and is **disconnected immediately**.

On successful connect:

- **Client** — auto-joined to its one thread. Nothing else needed to receive.
- **Coach** — join each thread you open with `conversation:join` (below).

> Refresh the token before it expires and reconnect; the socket does not refresh
> it for you.

---

## 2. Events you emit (client → server)

Every emit takes an **acknowledgement callback**. The ack is always one of:

```ts
{ ok: true, data?: T }        // success
{ ok: false, error: string }  // rejected (e.g. not an active relationship)
```

Use the ack instead of a separate error channel — it always resolves.

| Event | Payload | Who | Ack `data` |
|---|---|---|---|
| `conversation:join` | `{ clientId }` | coach (client is auto-joined) | — |
| `conversation:leave` | `{ clientId }` | coach | — |
| `message:send` | `{ clientId?, body, clientMsgId? }` | both | the created [`Message`](#message-shape) |
| `typing` | `{ clientId?, isTyping }` | both | — |
| `messages:read` | `{ clientId? }` | both | `{ count }` |

**`clientId` rules:** a **client omits it** (it is locked to itself); a **coach
must supply it** (the client it is talking to).

**`body`**: 1–4000 chars, trimmed server-side. Empty → negative ack.

**`clientMsgId`** (optional, ≤64 chars): your own temp id for the message. It is
echoed back on `message:new` so you can swap an optimistic bubble for the saved
one. See [optimistic send](#optimistic-send).

```js
// client sends to its coach
socket.emit('message:send', { body: 'hi coach', clientMsgId: tempId }, (ack) => {
  if (!ack.ok) return showError(ack.error);
  // ack.data is the persisted Message (has the real id + createdAt)
});

// coach sends to a specific client
socket.emit('message:send', { clientId, body: 'welcome aboard' }, (ack) => { ... });

// coach opens a thread to start receiving its live updates
socket.emit('conversation:join', { clientId }, (ack) => { ... });

// mark the other party's messages read (thread currently on screen)
socket.emit('messages:read', { clientId }, (ack) => { /* ack.data.count */ });

// typing indicator
socket.emit('typing', { clientId, isTyping: true });
socket.emit('typing', { clientId, isTyping: false });
```

---

## 3. Events you listen for (server → client)

| Event | Payload | Meaning |
|---|---|---|
| `message:new` | `{ ...Message, clientMsgId? }` | A new message in a thread you're in. `clientMsgId` is present only for the sender's own echo. |
| `conversation:updated` | `{ clientId, lastMessage: Message }` | Inbox hint for the **coach** — a thread got a new last message (update the list/badge even if not open). |
| `typing` | `{ clientId, from: 'coach' \| 'client', isTyping }` | The other party started/stopped typing. Never echoed to yourself. |
| `messages:read` | `{ clientId, reader: 'coach' \| 'client', readAt, count }` | The other party read your messages — flip your "sent" ticks to "read". |
| `error` | `{ message }` | Auth failure; a disconnect follows. |

```js
socket.on('message:new', (msg) => appendOrReconcile(msg));
socket.on('conversation:updated', ({ clientId, lastMessage }) => bumpInbox(clientId, lastMessage));
socket.on('typing', ({ clientId, from, isTyping }) => setTyping(clientId, isTyping));
socket.on('messages:read', ({ clientId, readAt }) => markThreadRead(clientId, readAt));
socket.on('error', ({ message }) => handleAuthError(message));
```

> Both parties in an open thread receive `message:new` — **including the sender**
> (for multi-device sync). Dedupe by `id`, and reconcile your optimistic copy via
> `clientMsgId`.

---

## 4. Message shape

```ts
interface Message {
  id: string;          // uuid
  tenantId: string;    // uuid
  clientId: string;    // uuid — identifies the thread
  senderType: 'coach' | 'client';
  body: string;
  readAt: string | null; // ISO timestamp, null = unread
  createdAt: string;     // ISO timestamp
}
```

---

## 5. REST endpoints

History, the coach inbox, and a fallback for sending. **Sending over REST also
broadcasts over WebSocket**, so web + mobile stay in sync regardless of transport.
All require the `Authorization: Bearer <accessToken>` header.

### Coach (coach token)

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/chat/conversations` | — | [`ConversationSummary[]`](#conversationsummary-shape) |
| `GET` | `/chat/conversations/:clientId/messages` | — | `Message[]` (oldest→newest) |
| `POST` | `/chat/conversations/:clientId/messages` | `{ body, clientMsgId? }` | `Message` (201) |
| `POST` | `/chat/conversations/:clientId/read` | — | `{ count }` |

### Client (client token)

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/client/me/chat/messages` | — | `Message[]` (oldest→newest) |
| `POST` | `/client/me/chat/messages` | `{ body, clientMsgId? }` | `Message` (201) |
| `POST` | `/client/me/chat/read` | — | `{ count }` |

### Pagination (history GET)

Query params `?before=<ISO timestamp>&limit=<n>`:

- `limit` — default `30`, max `100`.
- `before` — return messages **older** than this timestamp. Omit for the newest
  page; then pass the `createdAt` of the oldest message you have to load earlier.
- Always returned **oldest → newest** (ready to render top-to-bottom).

### `ConversationSummary` shape

```ts
interface ConversationSummary {
  clientId: string;
  client: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
  status: 'active' | 'paused';
  lastMessage: Message | null; // null if no messages yet
  unreadCount: number;         // client messages the coach hasn't read
}
```

Sorted most-recently-active first; empty threads sink to the bottom.

---

## 6. Typical flows

**Coach inbox screen** → `GET /chat/conversations`. Keep it live by listening for
`conversation:updated` (new last message / bump) and incrementing the badge on
`message:new` for threads not currently open.

**Opening a thread (coach)** → `emit('conversation:join', { clientId })`, then
`GET /chat/conversations/:clientId/messages` for history. New messages arrive via
`message:new`. When the thread is visible, `emit('messages:read', { clientId })`.

**Opening chat (client)** → already joined on connect; just
`GET /client/me/chat/messages` for history and listen for `message:new`.

### Optimistic send

```js
const clientMsgId = crypto.randomUUID();
renderPending({ clientMsgId, body, senderType: myRole, status: 'sending' });

socket.emit('message:send', { clientId, body, clientMsgId }, (ack) => {
  if (!ack.ok) return markFailed(clientMsgId, ack.error);
  // optional: you can reconcile here from ack.data too
});

// the authoritative copy also arrives via message:new (with clientMsgId echoed)
socket.on('message:new', (msg) => {
  if (msg.clientMsgId) reconcile(msg.clientMsgId, msg); // swap temp → real id
  else if (!haveMessage(msg.id)) append(msg);           // incoming from the other side
});
```

---

## 7. Authorization & errors

- **Only `active`/`paused` memberships can chat.** Otherwise: REST → `403`, WS →
  `{ ok: false, error: 'No active coaching relationship for this conversation' }`.
- A **client** can only ever act on its own thread; a **coach** only within its
  own tenant. `clientId` supplied by a coach is validated against its tenant.
- **Bad body** (empty / > 4000 chars) → negative ack.
- **Auth failure on connect** → `error` event, then disconnect. Re-auth with a
  fresh token and reconnect.
