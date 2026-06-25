# analytics-service

Spring Boot service providing dashboard statistics read API and aggregating domain events from RabbitMQ into a PostgreSQL read model.

## Stack
- Spring Boot 3 / Java 21
- PostgreSQL via Spring Data JPA
- Spring AMQP (RabbitMQ)

## Running locally

```bash
mvn spring-boot:run
```

Health endpoint: `GET /actuator/health`
