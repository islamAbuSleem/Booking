package com.hotel.booking.ports;

import com.hotel.booking.domain.Booking;
import com.hotel.booking.domain.Room;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface BookingRepository extends JpaRepository<Booking, Long> {

    Optional<Booking> findByBookingReference(String bookingReference);

    @Query("SELECT b FROM Booking b WHERE b.guestEmail = :email")
    Page<Booking> findByGuestEmail(@Param("email") String email, Pageable pageable);

    @Query("SELECT b FROM Booking b WHERE b.room.id = :roomId AND b.status IN :statuses")
    List<Booking> findByRoomIdAndStatuses(
            @Param("roomId") Long roomId,
            @Param("statuses") List<Booking.BookingStatus> statuses
    );

    @Query(value = """
        SELECT * FROM bookings b 
        WHERE b.room_id = :roomId 
        AND NOT (b.check_out_date <= :checkIn OR b.check_in_date >= :checkOut)
        AND b.status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')
        """, nativeQuery = true)
    List<Booking> findOverlappingBookings(
            @Param("roomId") Long roomId,
            @Param("checkIn") LocalDate checkIn,
            @Param("checkOut") LocalDate checkOut
    );
}