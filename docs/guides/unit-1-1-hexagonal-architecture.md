# Unit 1.1: Hexagonal Architecture Foundation
# Learning Guide

## What and Why

**Hexagonal Architecture (Ports & Adapters)** separates your business logic from technical concerns:
- **Domain**: Pure business rules (no frameworks)
- **Ports**: Interfaces defining what your domain needs
- **Adapters**: Concrete implementations (JPA, REST, etc.)

This makes testing easier and future migrations (monolith → microservices) seamless.

---

## Step 1: Create pom.xml

**File**: `backend/pom.xml`

### Explanation

```xml
<!-- parent section -->
<!-- Spring Boot provides dependency management so we don't specify versions -->
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.0</version>
</parent>
```

Key dependencies:
- `spring-boot-starter-web` → REST controllers, embedded Tomcat
- `spring-boot-starter-data-jpa` → JPA entities, repositories
- `spring-boot-starter-security` → Authentication, authorization
- `spring-boot-starter-validation` → Bean validation (@Valid)
- `postgresql` → PostgreSQL JDBC driver
- `flyway-core` → Database migrations
- `lombok` → Reduce boilerplate (getters/setters)
- `jjwt` → JWT token handling

---

## Step 2: Domain Entities

### Room Entity

**File**: `backend/src/main/java/com/hotel/booking/domain/Room.java`

**Key Concepts**:
- `@Entity` → Maps to database table
- `@Table` → Table constraints (unique room number)
- `@Enumerated(EnumType.STRING)` → Store enum as string, not int
- `@PrePersist` → Audit hook before database insert

**Annotations Explained**:
- `@Id` → Primary key
- `@GeneratedValue` → Auto-increment
- `@Column(nullable = false)` → NOT NULL constraint
- `@Column(unique = true)` → UNIQUE constraint

---

### Booking Entity

**File**: `backend/src/main/java/com/hotel/booking/domain/Booking.java`

**Business Rules**:
- bookingReference: Generated UUID for public identification
- Status flow: PENDING → CONFIRMED → CHECKED_IN → CHECKED_OUT → CANCELLED
- getNights(): Helper method for price calculation

---

## Step 3: Repository Interfaces

### What is a Repository?

A repository is a pattern that abstracts data access. It looks like a collection to your domain.

**Location**: `backend/src/main/java/com/hotel/booking/ports/`

### RoomRepository.java

Extends `JpaRepository<Room, Long>` which gives you:
- `findAll()`, `findById()`, `save()`, `delete()` automatically
- Add custom queries with `@Query` or method names

**Native SQL Query**:
```java
@Query(value = "SELECT * FROM rooms WHERE ...", nativeQuery = true)
```
Used for complex queries (date overlap) that JPQL can't express.

---

## Step 4: Database Migration

**File**: `backend/src/main/resources/db/migration/V1__init.sql`

**Flyway Naming**: `V{version}__{description}.sql`

**Key Design Decisions**:
- Separate indexes for status, type queries
- Composite index for date range overlap (faster availability check)
- Foreign key with CASCADE for data integrity

---

## Step 5: Application Configuration

**File**: `backend/src/main/resources/application.yml`

**Structure**:
```yaml
spring:
  datasource:      # Database connection
  jpa:            # JPA settings
  flyway:         # Migration tool
jwt:             # Custom properties
```

**Environment Variables**: `${JWT_SECRET:default}` allows override in production.

---

## Your Turn

Create these files in order:
1. `backend/pom.xml` - Copy the XML structure from the roadmap
2. `backend/src/main/resources/application.yml` - Configure database
3. `backend/src/main/java/com/hotel/booking/domain/Room.java` - Write the entity
4. Test with: Start Docker, run `./mvnw spring-boot:run`

Need the exact code for any step?