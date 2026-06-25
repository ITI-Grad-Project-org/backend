# ai-service

Spring Boot service handling AI assistant requests using Gemini and a RAG pipeline. Consumes `ai.requested` events from RabbitMQ and publishes `ai.completed` responses.

## Stack
- Spring Boot 3 / Java 21
- MongoDB (document store for RAG knowledge base)
- Spring AMQP (RabbitMQ)

## Running locally

```bash
mvn spring-boot:run
```

Health endpoint: `GET /actuator/health`
