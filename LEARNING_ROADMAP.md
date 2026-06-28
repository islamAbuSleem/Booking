# Solution Architecture Learning Roadmap
# Follow this step-by-step to build the hotel booking system

## PHASE 1: MONOLITHIC FOUNDATION (Unit 1.1-1.3)

### Unit 1.1: Hexagonal Architecture Foundation
**GOAL**: Create clean layer separation (domain, ports, adapters, config)

**STEP 1**: Create Maven project structure
- Location: backend/pom.xml
- Add dependencies: spring-boot-web, data-jpa, security, validation, postgresql, flyway, jjwt, lombok

**STEP 2**: Create domain entities (3 files)
- Location: backend/src/main/java/com/hotel/booking/domain/
- Files to create:
  - Room.java [id, number, type, capacity, price, status]
  - Booking.java [id, room, guest info, dates, status, totalPrice]
  - Guest.java [id, firstName, lastName, email, phone]
  - Rate.java [id, roomType, basePrice, seasonalModifier, validFrom, validTo]

**STEP 3**: Create repository interfaces (ports layer)
- Location: backend/src/main/java/com/hotel/booking/ports/
- Files to create:
  - RoomRepository.java - extends JpaRepository
  - BookingRepository.java - extends JpaRepository

**STEP 4**: Create database migration
- Location: backend/src/main/resources/db/migration/V1__init.sql
- Define: rooms, bookings, guests, rates tables with indexes

**STEP 5**: Configure application
- Location: backend/src/main/resources/application.yml
- Configure: database connection, JPA, JWT settings

---

### Unit 1.2: JWT Authentication
**GOAL**: Implement secure authentication with role-based access

**STEP 1**: Add User entity
- Location: backend/src/main/java/com/hotel/booking/domain/User.java
- Fields: id, username, email, password (encrypted), role (GUEST/ADMIN)

**STEP 2**: Create UserRepository
- Location: backend/src/main/java/com/hotel/booking/ports/UserRepository.java
- Methods: findByUsername, findByEmail, existsByUsername

**STEP 3**: Create JwtService
- Location: backend/src/main/java/com/hotel/booking/shared/JwtService.java
- Methods: generateToken, validateToken, extractUsername, extractRole

**STEP 4**: Create AuthController
- Location: backend/src/main/java/com/hotel/booking/adapters/AuthController.java
- Endpoints: POST /api/auth/register, POST /api/auth/login, POST /api/auth/refresh

**STEP 5**: Create JwtAuthenticationFilter
- Location: backend/src/main/java/com/hotel/booking/adapters/JwtAuthenticationFilter.java
- Extract token from header, validate, set SecurityContext

**STEP 6**: Create SecurityConfig
- Location: backend/src/main/java/com/hotel/booking/config/SecurityConfig.java
- Configure HTTP security, CORS, session management

---

### Unit 1.3: REST API
**GOAL**: Build booking endpoints with proper patterns

**STEP 1**: Create DTO classes in BookingController
- CreateBookingRequest (validated input)
- UpdateBookingRequest
- BookingResponse (output, never expose entities)
- PaginatedResponse

**STEP 2**: Create BookingController
- Location: backend/src/main/java/com/hotel/booking/adapters/BookingController.java
- Endpoints: GET /api/bookings, GET /api/bookings/{id}, POST /api/bookings, PUT /api/bookings/{id}, DELETE /api/bookings/{id}

**STEP 3**: Create GlobalExceptionHandler
- Location: backend/src/main/java/com/hotel/booking/adapters/GlobalExceptionHandler.java
- Handle: validation errors (400), not found (404), unauthorized (401), generic (500)

**STEP 4**: Create frontend API client
- Location: frontend/src/lib/api-client.ts
- Functions: getRooms, createBooking, getBookings, cancelBooking
- Add authorization header automatically

---

## PHASE 2: PERFORMANCE & CACHING (Units 2.1-2.2)

### Unit 2.1: Database & Caching
- Add version field to entities for optimistic locking
- Configure Redis cache with @Cacheable annotations
- Create AvailabilityCacheService for room availability queries

### Unit 2.2: Rate Limiting
- Add Bucket4j dependency
- Create RateLimitingFilter
- Configure Redis-based distributed rate limiting

---

## PHASE 3: MICROSERVICES (Units 3.1-3.3)

### Unit 3.1: Extract Inventory Service
- Convert to multi-module Maven project
- Create shared-events module
- Create inventory-service with its own database

### Unit 3.2: Event-driven Architecture
- Configure RabbitMQ listeners
- Create BookingEventListener for async processing
- Implement Outbox pattern

### Unit 3.3: Saga Pattern
- Create BookingSagaState entity
- Implement state machine for booking lifecycle
- Add compensation handlers