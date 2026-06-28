# Unit 1.2: JWT Authentication
# Learning Guide

## What and Why

**JWT (JSON Web Tokens)** provide stateless authentication:
- Server doesn't store sessions → scales horizontally
- Token contains user info → no database lookup on every request
- Signed with secret → tamper-proof

**Spring Security Flow**:
1. Request comes in with `Authorization: Bearer {token}`
2. JwtAuthenticationFilter extracts and validates token
3. If valid, creates Authentication object in SecurityContext
4. Controllers check `@PreAuthorize` or `SecurityContextHolder`

---

## Step 1: User Entity

**File**: `backend/src/main/java/com/hotel/booking/domain/User.java`

### Key Decisions
- `password` field stores BCrypt hash (never plain text)
- `role` enum enables role-based access control
- `@PrePersist` sets creation timestamp

### Password Encoding Flow
Plain text → `passwordEncoder.encode()` → BCrypt hash → stored in database

### BCrypt Verification
Hash in DB → `passwordEncoder.matches(plainText, hash)` → boolean

---

## Step 2: UserRepository

**File**: `backend/src/main/java/com/hotel/booking/ports/UserRepository.java`

### Spring Data Method Naming
- `findByUsername` → SELECT * FROM users WHERE username = ?
- `existsByEmail` → SELECT COUNT(*) > 0 FROM users WHERE email = ?

No implementation needed - Spring generates it at runtime.

---

## Step 3: JwtService

**File**: `backend/src/main/java/com/hotel/booking/shared/JwtService.java`

### Token Structure
```
HEADER: { "alg": "HS256", "typ": "JWT" }
PAYLOAD: { "sub": "username", "role": "GUEST", "iat": 1234567890, "exp": 1234577890 }
SIGNATURE: HMAC-SHA256(header + payload, secret)
```

### Key Methods
- `generateToken(username, role)` → Creates signed token
- `validateToken(token)` → Checks signature and expiration
- `extractUsername(token)` → Gets user from "sub" claim
- `extractRole(token)` → Gets role from custom claim

---

## Step 4: JwtAuthenticationFilter

**Key Annotations**
- `@Component` → Spring bean for dependency injection
- `OncePerRequestFilter` → Runs once per request

### Filter Chain Order
```
Request → JwtAuthenticationFilter → UsernamePasswordAuthenticationFilter → Controller
```

We add BEFORE UsernamePasswordAuthenticationFilter to protect all endpoints.

### SecurityContext
Thread-local storage for authentication:
```java
SecurityContextHolder.getContext().setAuthentication(auth);
// Later, in any service:
SecurityContextHolder.getContext().getAuthentication().getName();
```

---

## Step 5: SecurityConfig

**Key Configurations**

### CSRF Disabled
```yaml
csrf: DISABLED for APIs (REST clients handle differently)
```
Enable for web forms, disable for REST APIs.

### CORS
```java
.allowedOrigins("http://localhost:3000")  // Frontend origin
.allowedMethods("GET", "POST", "PUT", "DELETE")
```

### Session Management
```java
.sessionCreationPolicy(STATELESS)  // No HTTP session
```
JWT is self-contained, no server-side session needed.

---

## Step 6: AuthController

**Endpoints**

### POST /api/auth/register
1. Check if username/email exists (400 if exists)
2. Hash password with BCrypt
3. Save User entity
4. Return JWT token

### POST /api/auth/login
1. Find user by username
2. Compare passwords with BCrypt
3. Return JWT if valid (401 if invalid)

### POST /api/auth/refresh
1. Validate refresh token
2. Issue new access token

---

## Security Checklist

- [ ] Token expires in 24 hours
- [ ] Refresh token expires in 7 days
- [ ] Password is BCrypt encoded
- [ ] HTTPS in production
- [ ] Secret key from environment variable
- [ ] Public endpoints: /api/auth/**, /swagger-ui/**

---

## Your Turn

Create files in order:
1. User.java entity
2. UserRepository interface
3. JwtService component
4. JwtAuthenticationFilter
5. SecurityConfig class
6. AuthController

Test flow:
```bash
# Register
curl -X POST localhost:8080/api/auth/register -H "Content-Type: application/json" -d '{"username":"test","email":"test@test.com","password":"password123"}'

# Login  
curl -X POST localhost:8080/api/auth/login -d '{"username":"test","password":"password123"}'

# Test protected endpoint
curl localhost:8080/api/bookings -H "Authorization: Bearer {token}"
```