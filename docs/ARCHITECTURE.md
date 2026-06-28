# Hotel Booking System - Architecture Decisions

## Phase 1: Monolithic Foundation

### Decision 1: Hexagonal Architecture

**Context:** Need to establish clean boundaries before extracting to microservices.

**Decision:** Use ports/adapters (hexagonal) pattern with three layers:
- Domain: Pure business logic (entities, value objects)
- Ports: Interfaces defining repository contracts
- Adapters: JPA implementations, REST controllers

**Rationale:** This makes future service extraction easier - we can move adapters without touching domain logic.

### Decision 2: Package Structure

Following domain-driven design:
- `com.hotel.booking.domain` - Entities only
- `com.hotel.booking.ports` - Repository interfaces
- `com.hotel.booking.adapters` - Persistence implementations
- `com.hotel.booking.shared` - Common utilities
- `com.hotel.booking.config` - Spring configuration

### Decision 3: Database Schema

Chosen single database with clear schemas for future extraction:
- rooms table - will become inventory-service schema
- bookings table - will become booking-service schema
- Foreign keys maintain data integrity during monolith phase

## Progress Log

### 2026-06-28 - Project Initialization
- Created directory structure
- Set up Spring Boot with Maven
- Configured JPA entities (Room, Booking, Guest, Rate)
- Designed repositories with availability queries
- Docker Compose for PostgreSQL, Redis, RabbitMQ

### 2026-06-28 - Authentication & API (Units 1.2-1.3)
- User entity with role-based access (GUEST/ADMIN)
- JWT tokens with 24h expiry, refresh tokens
- Spring Security configuration with stateless sessions
- Booking REST endpoints with CRUD operations
- Global exception handler with field-level validation errors
- Frontend auth utilities with token refresh
- REST API with proper HTTP status codes (201, 400, 404)

## Next Steps

Phase 1 complete. Ready for Phase 2: Performance and Caching.