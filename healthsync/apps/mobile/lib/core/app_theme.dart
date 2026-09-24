import 'package:flutter/material.dart';

/// HealthSync Design System — Tema per-role
/// Setiap role memiliki color palette yang berbeda untuk identifikasi visual yang jelas.
class AppTheme {
  AppTheme._();

  // ── Warna Dasar ────────────────────────────────────
  static const Color _pasienSeed    = Color(0xFF1565C0); // Biru medis
  static const Color _apotekSeed    = Color(0xFF2E7D32); // Hijau apotek
  static const Color _driverSeed    = Color(0xFFE65100); // Oranye driver
  static const Color _ambulansSeed  = Color(0xFFC62828); // Merah darurat

  // ── Warna Netral ────────────────────────────────────
  static const Color abu100  = Color(0xFFF5F7FA);
  static const Color abu200  = Color(0xFFE8ECF0);
  static const Color abu300  = Color(0xFFCDD2D8);
  static const Color abu500  = Color(0xFF6B7280);
  static const Color abu700  = Color(0xFF374151);
  static const Color abu900  = Color(0xFF111827);

  // ── Warna Semantik ──────────────────────────────────
  static const Color sukses   = Color(0xFF16A34A);
  static const Color peringatan = Color(0xFFD97706);
  static const Color bahaya   = Color(0xFFDC2626);
  static const Color info     = Color(0xFF0284C7);

  // ── Spacing ─────────────────────────────────────────
  static const double sXS = 4;
  static const double sS  = 8;
  static const double sM  = 16;
  static const double sL  = 24;
  static const double sXL = 32;

  // ── Border Radius ────────────────────────────────────
  static const double rS  = 8;
  static const double rM  = 12;
  static const double rL  = 16;
  static const double rXL = 24;

  // ── Shadows ──────────────────────────────────────────
  static List<BoxShadow> get shadowS => [
    BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 8, offset: const Offset(0, 2)),
  ];
  static List<BoxShadow> get shadowM => [
    BoxShadow(color: Colors.black.withOpacity(0.10), blurRadius: 16, offset: const Offset(0, 4)),
  ];

  // ── Tema per-role ─────────────────────────────────────

  static ThemeData pasienTheme() => _buildTheme(_pasienSeed);
  static ThemeData apotekTheme() => _buildTheme(_apotekSeed);
  static ThemeData driverTheme() => _buildTheme(_driverSeed);
  static ThemeData ambulansTheme() => _buildTheme(_ambulansSeed);

  static ThemeData _buildTheme(Color seed) {
    final cs = ColorScheme.fromSeed(
      seedColor: seed,
      brightness: Brightness.light,
    );
    return ThemeData(
      colorScheme: cs,
      useMaterial3: true,
      fontFamily: 'Roboto',
      scaffoldBackgroundColor: abu100,
      appBarTheme: AppBarTheme(
        centerTitle: false,
        elevation: 0,
        backgroundColor: Colors.white,
        foregroundColor: abu900,
        titleTextStyle: const TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: abu900,
          fontFamily: 'Roboto',
        ),
        iconTheme: const IconThemeData(color: abu700),
      ),
      cardTheme: CardTheme(
        elevation: 0,
        color: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(rM),
          side: const BorderSide(color: abu200),
        ),
        margin: EdgeInsets.zero,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: abu100,
        contentPadding: const EdgeInsets.symmetric(horizontal: sM, vertical: sS + 4),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(rS),
          borderSide: const BorderSide(color: abu300),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(rS),
          borderSide: const BorderSide(color: abu300),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(rS),
          borderSide: BorderSide(color: seed, width: 2),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: seed,
          foregroundColor: Colors.white,
          minimumSize: const Size(double.infinity, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(rS),
          ),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.3,
          ),
          elevation: 0,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(double.infinity, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(rS),
          ),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: abu200,
        selectedColor: seed.withOpacity(0.15),
        labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
        padding: const EdgeInsets.symmetric(horizontal: sS, vertical: 2),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        side: BorderSide.none,
      ),
      dividerTheme: const DividerThemeData(color: abu200, thickness: 1, space: 1),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: Colors.white,
        selectedItemColor: seed,
        unselectedItemColor: abu500,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
        showSelectedLabels: true,
        showUnselectedLabels: true,
        selectedLabelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
        unselectedLabelStyle: const TextStyle(fontSize: 11),
      ),
    );
  }

  // ── Gradien per-role ──────────────────────────────────

  static LinearGradient pasienGradient() => LinearGradient(
    colors: [_pasienSeed, const Color(0xFF1976D2)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static LinearGradient apotekGradient() => LinearGradient(
    colors: [_apotekSeed, const Color(0xFF388E3C)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static LinearGradient driverGradient() => LinearGradient(
    colors: [_driverSeed, const Color(0xFFF57C00)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static LinearGradient ambulansGradient() => LinearGradient(
    colors: [_ambulansSeed, const Color(0xFFE53935)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // ── Warna per-role (dipakai di shared widgets) ─────────
  // Warna per-role — sesuai nilai role dari database
  static Color colorForRole(String role) {
    switch (role.toUpperCase()) {
      case 'PHARMACIST':
        return _apotekSeed;
      case 'AMBULANCE_DRIVER':
        return _driverSeed;
      default:
        // PATIENT, DOCTOR, ADMIN, COMMAND_CENTER
        return _pasienSeed;
    }
  }
}
