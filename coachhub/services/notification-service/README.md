# notification-service

Spring Boot stateless service delivering email and in-app notifications. Triggered by domain events consumed from RabbitMQ.

## Stack
- Spring Boot 3 / Java 21
- Spring Mail (SMTP)
- Spring AMQP (RabbitMQ)
- Stateless — no database

## Running locally

```bash
mvn spring-boot:run
```

Health endpoint: `GET /actuator/health`
