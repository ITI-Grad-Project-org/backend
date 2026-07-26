package com.coachhub.notification.rabbitmq.payload;

/** A client asked to train with a coach — emailed to the coach. */
public record ClientRequestedPayload(
				String membershipId,
				String clientId,
				String clientName,
				String clientEmail,
				String coachId,
				String coachEmail,
				String coachName,
				String tenantName,
				String message,
				String requestsUrl
) {
}
