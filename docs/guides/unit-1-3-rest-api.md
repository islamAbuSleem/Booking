# Unit 1.3: REST API Design
# Learning Guide

## What and Why

**REST (Representational State Transfer)** principles:
- Resources (nouns) in URLs: `/bookings`, `/rooms`
- HTTP verbs (actions): GET, POST, PUT, DELETE
- Status codes (outcomes): 200, 201, 400, 404, 401, 500
- Stateless: Each request contains all needed info

**DTO Pattern** separates internal entities from API contracts:
- Clients never see database entities
- Prevents overposting (hackers guessing fields)
- Versioning becomes possible

---

## Step 1: DTO Classes

### CreateBookingRequest

**Validation Annotations**:
- `@NotNull` → Field required, not null
- `@NotBlank` → Field required, not empty/whitespace
- `@Email` → Valid email format
- `@FutureOrPresent` → Date must be today or future
- `@Min(1)` → Number must be >= 1

### BookingResponse

**DTO vs Entity**:
- Entity: Lazy-loaded relationships, internal IDs
- Response: Eager data, computed fields, flat structure

Use `.build()` pattern to convert:
```java
BookingResponse toResponse(Booking booking) {
    return new BookingResponse(
        booking.getId(),
        booking.getRoom().getNumber(), // Flattened
        ...
    );
}
```

---

## Step 2: BookingController

### Endpoint Design

| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| GET | /api/bookings | List all | 200 |
| GET | /api/bookings/{id} | Get one | 200/404 |
| POST | /api/bookings | Create | 201/400 |
| PUT | /api/bookings/{id} | Update | 200/404 |
| DELETE | /api/bookings/{id} | Cancel | 204/404 |

### Availability Query Logic

**Date Overlap Detection**:
```
Booking exists if:
- Check-in < requested check-out AND
- Check-out > requested check-in
```

In SQL:
```sql
SELECT * FROM bookings 
WHERE room_id = ? 
AND NOT (check_out_date <= :checkIn OR check_in_date >= :checkOut)
```

### Business Rules in Controller

1. **Validation**: Check overlapping bookings before creating
2. **Room Status**: Ensure room is AVAILABLE
3. **Price Calculation**: `nights × room.price`
4. **Side Effects**: Update room status on booking

---

## Step 3: GlobalExceptionHandler

### Why @ControllerAdvice?

Handles exceptions globally instead of in each controller:
- Single place for error response format
- Consistent API errors across all endpoints

### Exception Hierarchy

| Exception | HTTP Status | When |
|-----------|------------|------|
| MethodArgumentNotValidException | 400 | Validation failed |
| NoSuchElementException | 404 | Entity not found |
| AccessDeniedException | 403 | Forbidden |
| Exception | 500 | Unexpected error |

### Response Format (RFC 7807)

```json
{
  "type": "validation-error",
  "title": "Bad Request",
  "status": 400,
  "errors": [
    { "field": "email", "message": "must be valid" }
  ]
}
```

---

## Step 4: Frontend API Client

### Axios Interceptor Pattern

```typescript
// Request interceptor
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor  
axios.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      // Token expired, try refresh
      const newToken = await refreshToken();
      error.config.headers.Authorization = `Bearer ${newToken}`;
      return axios(error.config);
    }
    return Promise.reject(error);
  }
);
```

### API Functions

Each function handles error cases:
- Network error → Promise.reject
- 401 → Try refresh, redirect to login
- 400 → Return error details to caller

---

## Step 5: Testing Strategy

### Manual Testing with curl

```bash
# Set token from login response
TOKEN=eyJhbGciOiJIUzI1NiJ9...

# List bookings
curl -H "Authorization: Bearer $TOKEN" localhost:8080/api/bookings

# Create booking
curl -X POST localhost:8080/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"roomId":1,"guestName":"John","checkInDate":"2024-06-01","checkOutDate":"2024-06-03"}'
```

### Verification Checklist

- [ ] Register/login returns JWT
- [ ] Protected endpoint returns 401 without token
- [ ] Invalid dates rejected with 400
- [ ] Overlapping bookings rejected
- [ ] Database reflects room availability changes

---

## Your Turn

Create files in order:
1. Backend: BookingController with all endpoints
2. Backend: DTO classes inside controller or separate package
3. Backend: GlobalExceptionHandler
4. Frontend: api-client.ts with all functions

After coding, verify each endpoint works as documented.