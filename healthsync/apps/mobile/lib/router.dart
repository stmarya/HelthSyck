import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/providers/auth_provider.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/vitals_screen.dart';
import 'screens/consultation_list_screen.dart';
import 'screens/consultation_room_screen.dart';
import 'screens/book_consultation_screen.dart';
import 'screens/prescriptions_screen.dart';
import 'screens/hospital_search_screen.dart';
import 'screens/ambulance_screen.dart';
import 'screens/profile_screen.dart';
import 'features/apotek/screens/dashboard_apotek_screen.dart';
import 'features/apotek/screens/resep_masuk_screen.dart';
import 'features/apotek/screens/kelola_obat_screen.dart';
import 'features/apotek/screens/history_apotek_screen.dart';
import 'features/driver/screens/dashboard_driver_screen.dart';
import 'features/driver/screens/order_aktif_screen.dart';
import 'features/driver/screens/navigasi_screen.dart';
import 'features/driver/screens/riwayat_antar_screen.dart';
import 'features/ambulans/screens/dashboard_ambulans_screen.dart';
import 'features/ambulans/screens/panggilan_darurat_screen.dart';
import 'features/ambulans/screens/navigasi_darurat_screen.dart';
import 'features/ambulans/screens/riwayat_tugas_screen.dart';

class AppRole {
  static const String pasien    = 'PATIENT';
  static const String dokter    = 'DOCTOR';
  static const String apotek    = 'PHARMACIST';         // DB: PHARMACIST
  static const String driver    = 'PHARMACY_DRIVER';    // DB: PHARMACY_DRIVER
  static const String ambulans  = 'AMBULANCE_DRIVER';   // DB: AMBULANCE_DRIVER
  static const String admin     = 'ADMIN';
  static const String cc        = 'COMMAND_CENTER';
}

GoRouter buildMultiRoleRouter(AuthState authState) => GoRouter(
  initialLocation: '/',
  redirect: (BuildContext context, GoRouterState state) {
    final isAuth = authState.status == AuthStatus.authenticated;
    final isUnknown = authState.status == AuthStatus.unknown;
    final path = state.uri.path;
    final isLogin = path == '/login';
    if (isUnknown) return null;
    if (!isAuth && !isLogin) return '/login';
    if (isAuth && (isLogin || path == '/')) return _dashboardForRole(authState.user?.role ?? '');
    if (isAuth && !_canAccessPath(authState.user?.role ?? '', path)) return _dashboardForRole(authState.user?.role ?? '');
    return null;
  },
  routes: [
    GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    GoRoute(path: '/dashboard', builder: (_, __) => const DashboardScreen()),
    GoRoute(path: '/vitals', builder: (_, __) => const VitalsScreen()),
    GoRoute(path: '/consultations', builder: (_, __) => const ConsultationListScreen()),
    GoRoute(path: '/consultations/book', builder: (_, __) => const BookConsultationScreen()),
    GoRoute(path: '/consultations/:id', builder: (_, s) => ConsultationRoomScreen(consultationId: s.pathParameters['id']!)),
    GoRoute(path: '/prescriptions', builder: (_, __) => const PrescriptionsScreen()),
    GoRoute(path: '/hospitals', builder: (_, __) => const HospitalSearchScreen()),
    GoRoute(path: '/ambulance', builder: (_, __) => const AmbulanceScreen()),
    GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
    GoRoute(path: '/apotek', builder: (_, __) => const DashboardApotekScreen()),
    GoRoute(path: '/apotek/resep', builder: (_, __) => const ResepMasukScreen()),
    GoRoute(path: '/apotek/obat', builder: (_, __) => const KelolaObatScreen()),
    GoRoute(path: '/apotek/history', builder: (_, __) => const HistoryApotekScreen()),
    GoRoute(path: '/driver', builder: (_, __) => const DashboardDriverScreen()),
    GoRoute(path: '/driver/order', builder: (_, __) => const OrderAktifScreen()),
    GoRoute(path: '/driver/navigasi/:orderId', builder: (_, s) => NavigasiScreen(orderId: s.pathParameters['orderId']!)),
    GoRoute(path: '/driver/riwayat', builder: (_, __) => const RiwayatAntarScreen()),
    GoRoute(path: '/ambulans', builder: (_, __) => const DashboardAmbulansScreen()),
    GoRoute(path: '/ambulans/panggilan', builder: (_, __) => const PanggilanDaruratScreen()),
    GoRoute(path: '/ambulans/navigasi/:taskId', builder: (_, s) => NavigasiDaruratScreen(taskId: s.pathParameters['taskId']!)),
    GoRoute(path: '/ambulans/riwayat', builder: (_, __) => const RiwayatTugasScreen()),
  ],
);

String _dashboardForRole(String role) {
  switch (role.toUpperCase()) {
    case AppRole.apotek: return '/apotek';
    case AppRole.driver: return '/driver';
    case AppRole.ambulans: return '/ambulans';
    default: return '/dashboard';
  }
}

bool _canAccessPath(String role, String path) {
  final normalized = role.toUpperCase();
  if (normalized == AppRole.admin || normalized == AppRole.cc) return true;
  if (path == '/profile') return true;
  if (normalized == AppRole.apotek) return path.startsWith('/apotek');
  if (normalized == AppRole.driver) return path.startsWith('/driver');
  if (normalized == AppRole.ambulans) return path.startsWith('/ambulans');
  if (normalized == AppRole.pasien || normalized == AppRole.dokter) return path == '/dashboard' || path == '/vitals' || path.startsWith('/consultations') || path == '/prescriptions' || path == '/hospitals' || path == '/ambulance';
  return false;
}
