# CoachHub Message Contracts

All messages exchanged over RabbitMQ carry the following envelope headers:

| Field | Type | Description |
|---|---|---|
| `tenantId` | string (UUID) | Identifies the tenant this event belongs to |
| `correlationId` | string (UUID) | End-to-end trace identifier |
| `messageType` | string | Fully-qualified event name (e.g. `client.invited`) |
| `timestamp` | ISO-8601 | When the event was emitted |
| `schemaVersion` | string (semver) | Schema version for forward-compatibility |

## Event stubs

The following domain events are planned. Payloads TBD.

- `client.invited`
- `plan.assigned`
- `checkin.due`
- `checkin.submitted`
- `workout.logged`
- `message.sent`
- `ai.requested`
- `ai.completed`
