package com.hotel.booking.adapters;

import com.hotel.booking.domain.*;
import com.hotel.booking.ports.*;
import jakarta.validation.*;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

@RestController
@RequestMapping("/api/bookings")
@RequiredArgsConstructor
public class BookingController {

    private final BookingRepository bookingRepository;
    private final RoomRepository roomRepository;

    @GetMapping
    public ResponseEntity<PaginatedResponse<BookingResponse>> listBookings(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String email,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        
        Page<Booking> bookings;
        if (email != null) {
            bookings = bookingRepository.findByGuestEmail(email, pageable);
        } else {
            bookings = bookingRepository.findAll(pageable);
        }

        List<BookingResponse> content = bookings.getContent().stream()
                .map(this::toResponse)
                .toList();

        return ResponseEntity.ok(new PaginatedResponse<>(
                content,
                bookings.getTotalElements(),
                bookings.getTotalPages(),
                bookings.getNumber()
        ));
    }

    @GetMapping("/{id}")
    public ResponseEntity<BookingResponse> getBooking(@PathVariable Long id) {
        Booking booking = bookingRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Booking not found"));
        return ResponseEntity.ok(toResponse(booking));
    }

    @PostMapping
    public ResponseEntity<BookingResponse> createBooking(
            @Valid @RequestBody CreateBookingRequest request
    ) {
        List<Booking> overlapping = bookingRepository.findOverlappingBookings(
                request.roomId(),
                request.checkInDate(),
                request.checkOutDate()
        );

        if (!overlapping.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        Room room = roomRepository.findById(request.roomId())
                .orElseThrow(() -> new NoSuchElementException("Room not found"));

        if (room.getStatus() != Room.RoomStatus.AVAILABLE) {
            return ResponseEntity.badRequest().build();
        }

        long nights = request.checkInDate().until(request.checkOutDate()).getDays();
        BigDecimal totalPrice = room.getPrice().multiply(BigDecimal.valueOf(nights));

        Booking booking = Booking.builder()
                .room(room)
                .guestName(request.guestName())
                .guestEmail(request.guestEmail())
                .guestPhone(request.guestPhone())
                .checkInDate(request.checkInDate())
                .checkOutDate(request.checkOutDate())
                .guests(request.guests())
                .totalPrice(totalPrice)
                .specialRequests(request.specialRequests())
                .status(Booking.BookingStatus.CONFIRMED)
                .build();

        bookingRepository.save(booking);
        room.setStatus(Room.RoomStatus.OCCUPIED);
        roomRepository.save(room);

        return ResponseEntity.status(HttpStatus.CREATED)
                .eTag(booking.getBookingReference())
                .body(toResponse(booking));
    }

    @PutMapping("/{id}")
    public ResponseEntity<BookingResponse> updateBooking(
            @PathVariable Long id,
            @Valid @RequestBody UpdateBookingRequest request
    ) {
        Booking booking = bookingRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Booking not found"));

        booking.setStatus(request.status());
        booking.setSpecialRequests(request.specialRequests());
        bookingRepository.save(booking);

        return ResponseEntity.ok(toResponse(booking));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> cancelBooking(@PathVariable Long id) {
        Booking booking = bookingRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Booking not found"));

        booking.setStatus(Booking.BookingStatus.CANCELLED);
        bookingRepository.save(booking);

        Room room = booking.getRoom();
        room.setStatus(Room.RoomStatus.AVAILABLE);
        roomRepository.save(room);

        return ResponseEntity.noContent().build();
    }

    private BookingResponse toResponse(Booking booking) {
        return new BookingResponse(
                booking.getId(),
                booking.getBookingReference(),
                booking.getRoom().getId(),
                booking.getRoom().getNumber(),
                booking.getGuestName(),
                booking.getGuestEmail(),
                booking.getGuestPhone(),
                booking.getCheckInDate(),
                booking.getCheckOutDate(),
                booking.getGuests(),
                booking.getStatus(),
                booking.getTotalPrice(),
                booking.getSpecialRequests(),
                booking.getCreatedAt()
        );
    }

    public record CreateBookingRequest(
            @NotNull Long roomId,
            @NotBlank String guestName,
            @NotBlank @Email String guestEmail,
            String guestPhone,
            @NotNull @FutureOrPresent LocalDate checkInDate,
            @NotNull @Future LocalDate checkOutDate,
            @Min(1) Integer guests,
            String specialRequests
    ) {}

    public record UpdateBookingRequest(
            Booking.BookingStatus status,
            String specialRequests
    ) {}

    public record BookingResponse(
            Long id,
            String bookingReference,
            Long roomId,
            String roomNumber,
            String guestName,
            String guestEmail,
            String guestPhone,
            LocalDate checkInDate,
            LocalDate checkOutDate,
            Integer guests,
            Booking.BookingStatus status,
            BigDecimal totalPrice,
            String specialRequests,
            java.time.LocalDateTime createdAt
    ) {}

    public record PaginatedResponse<T>(
            List<T> content,
            long totalElements,
            int totalPages,
            int number
    ) {}
}