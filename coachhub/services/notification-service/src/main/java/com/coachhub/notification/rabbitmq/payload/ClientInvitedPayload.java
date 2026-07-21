package com.coachhub.notification.rabbitmq.payload;

public record ClientInvitedPayload(
				String inviteId,
				String coachId,
				String coachName,
				String clientEmail,
				String clientName,
				String otp,
				String expiresAt
) {
}
