package com.hotel.booking.adapters;

import com.hotel.booking.domain.User;
import com.hotel.booking.shared.JwtService;
import com.hotel.booking.ports.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        if (userRepository.existsByUsername(request.username()) ||
            userRepository.existsByEmail(request.email())) {
            return ResponseEntity.badRequest().build();
        }

        User user = User.builder()
                .username(request.username())
                .email(request.email())
                .password(passwordEncoder.encode(request.password()))
                .role(User.Role.GUEST)
                .build();

        userRepository.save(user);

        String token = jwtService.generateToken(user.getUsername(), user.getRole().name());
        String refreshToken = jwtService.generateRefreshToken(user.getUsername());

        return ResponseEntity.ok(new AuthResponse(token, refreshToken));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        User user = userRepository.findByUsername(request.username())
                .orElse(null);

        if (user == null || !passwordEncoder.matches(request.password(), user.getPassword())) {
            return ResponseEntity.status(401).build();
        }

        String token = jwtService.generateToken(user.getUsername(), user.getRole().name());
        String refreshToken = jwtService.generateRefreshToken(user.getUsername());

        return ResponseEntity.ok(new AuthResponse(token, refreshToken));
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@Valid @RequestBody RefreshRequest request) {
        String username = jwtService.extractUsername(request.refreshToken());

        if (!jwtService.validateToken(request.refreshToken())) {
            return ResponseEntity.status(401).build();
        }

        User user = userRepository.findByUsername(username).orElse(null);
        if (user == null) {
            return ResponseEntity.status(401).build();
        }

        String token = jwtService.generateToken(user.getUsername(), user.getRole().name());

        return ResponseEntity.ok(new AuthResponse(token, request.refreshToken()));
    }

    public record RegisterRequest(
            @NotBlank @Size(min = 3, max = 50) String username,
            @NotBlank @Email String email,
            @NotBlank @Size(min = 6, max = 100) String password
    ) {}

    public record LoginRequest(
            @NotBlank String username,
            @NotBlank String password
    ) {}

    public record RefreshRequest(@NotBlank String refreshToken) {}

    public record AuthResponse(String token, String refreshToken) {}
}