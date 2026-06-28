package com.hotel.booking.ports;

import com.hotel.booking.domain.Room;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface RoomRepository extends JpaRepository<Room, Long> {

    List<Room> findByStatus(Room.RoomStatus status);

    @Query("SELECT r FROM Room r WHERE r.type = :type AND r.status = :status")
    List<Room> findByTypeAndStatus(@Param("type") Room.RoomType type, @Param("status") Room.RoomStatus status);

    @Query(value = """
        SELECT * FROM rooms r WHERE r.status = 'AVAILABLE' 
        AND r.id NOT IN (
            SELECT b.room_id FROM bookings b 
            WHERE NOT (b.check_out_date <= :checkIn OR b.check_in_date >= :checkOut)
            AND b.status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')
        )
        """, nativeQuery = true)
    List<Room> findAvailableRooms(
            @Param("checkIn") LocalDate checkIn,
            @Param("checkOut") LocalDate checkOut
    );
}