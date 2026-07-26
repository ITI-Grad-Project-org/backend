package com.coachhub.notification.rabbitmq.payload;

/** The coach approved or turned down a join request — emailed to the client. */
public record ClientRequestDecidedPayload(
				String membershipId,
				String clientId,
				String clientEmail,
				String clientName,
				String coachId,
				String coachName,
				String tenantName,
				String otp,
				String actionUrl
) {
}
