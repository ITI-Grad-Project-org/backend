package com.coachhub.notification.rabbitmq.payload;

public record PasswordResetPayload(
				String email,
				String name,
				String otp,
				Integer expiresInMinutes
) {
}
