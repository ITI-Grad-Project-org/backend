# syntax=docker/dockerfile:1.7

# ── Stage 1: build (BuildKit cache keeps ~/.m2 across builds) ──────────────
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:go-offline
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q package -DskipTests

# ── Stage 2: explode the Spring Boot layered JAR ───────────────────────────
FROM eclipse-temurin:21-jre-alpine AS layers
WORKDIR /layers
COPY --from=build /workspace/target/*.jar app.jar
RUN java -Djarmode=layertools -jar app.jar extract

# ── Stage 3: runtime, non-root, dependency layers cached separately ────────
FROM eclipse-temurin:21-jre-alpine
# Explicit UID so K8s runAsNonRoot can verify the user numerically.
RUN addgroup -S -g 1001 spring && adduser -S -u 1001 -G spring spring
USER spring
WORKDIR /app
COPY --from=layers /layers/dependencies/          ./
COPY --from=layers /layers/spring-boot-loader/    ./
COPY --from=layers /layers/snapshot-dependencies/ ./
COPY --from=layers /layers/application/           ./
# Heap sized from the container memory limit, not a fixed -Xmx.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8081
# Spring Boot >= 3.2 launcher (for 3.0/3.1: org.springframework.boot.loader.JarLauncher)
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
