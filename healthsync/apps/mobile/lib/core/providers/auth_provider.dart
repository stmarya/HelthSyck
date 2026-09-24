import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:logger/logger.dart';

import '../models/user.dart';
import '../api_client.dart';

// ─────────────────────────────────────────────
// Auth state
// ─────────────────────────────────────────────

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState {
  final AuthStatus status;
  final User? user;
  final AuthTokens? tokens;
  final String? error;

  const AuthState({
    this.status = AuthStatus.unknown,
    this.user,
    this.tokens,
    this.error,
  });

  AuthState copyWith({
    AuthStatus? status,
    User? user,
    AuthTokens? tokens,
    String? error,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      tokens: tokens ?? this.tokens,
      error: error,
    );
  }

  bool get isAuthenticated => status == AuthStatus.authenticated;
  String? get accessToken => tokens?.accessToken;
}

// ─────────────────────────────────────────────
// Auth notifier
// ─────────────────────────────────────────────

class AuthNotifier extends StateNotifier<AuthState> {
  final ApiClient _api;
  final FlutterSecureStorage _storage;
  final Logger _log;

  static const _accessTokenKey = 'hs_access_token';
  static const _refreshTokenKey = 'hs_refresh_token';
  static const _userKey = 'hs_user';

  AuthNotifier(this._api, this._storage, this._log)
      : super(const AuthState()) {
    _restoreSession();
  }

  // ── Restore persisted session ──────────────────

  Future<void> _restoreSession() async {
    try {
      final accessToken = await _storage.read(key: _accessTokenKey);
      final refreshToken = await _storage.read(key: _refreshTokenKey);
      final userJson = await _storage.read(key: _userKey);

      if (accessToken != null && refreshToken != null && userJson != null) {
        final user = User.fromJson(
          jsonDecode(userJson) as Map<String, dynamic>,
        );
        _api.setTokens(
          accessToken: accessToken,
          refreshToken: refreshToken,
        );
        state = AuthState(
          status: AuthStatus.authenticated,
          user: user,
          tokens: AuthTokens(
            accessToken: accessToken,
            refreshToken: refreshToken,
          ),
        );
        _log.i('Session restored for ${user.email}');
      } else {
        state = state.copyWith(status: AuthStatus.unauthenticated);
      }
    } catch (e) {
      _log.e('Failed to restore session: $e');
      state = state.copyWith(status: AuthStatus.unauthenticated);
    }
  }

  // ── Login ──────────────────────────────────────

  Future<void> login({required String email, required String password}) async {
    state = state.copyWith(status: AuthStatus.unknown, error: null);
    try {
      final response = await _api.post(
        '/v1/auth/login',
        body: {'email': email, 'password': password},
      );

      final data = response['data'] as Map<String, dynamic>;
      final tokens = AuthTokens.fromJson(data);
      // API mengembalikan struktur flat: { userId, email, role, accessToken, refreshToken }
      // Perlu map 'userId' → 'id' untuk User.fromJson
      final userJson = <String, dynamic>{
        'id':    data['userId']?.toString() ?? data['id']?.toString() ?? '',
        'email': data['email']?.toString() ?? '',
        'role':  data['role']?.toString() ?? 'PATIENT',
        'name':  data['name']?.toString(),
        'phone': data['phone']?.toString(),
        'patientId': data['patientId']?.toString(),
        'doctorId':  data['doctorId']?.toString(),
      };
      final user = User.fromJson(userJson);

      _api.setTokens(
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      );

      await _storage.write(key: _accessTokenKey, value: tokens.accessToken);
      await _storage.write(key: _refreshTokenKey, value: tokens.refreshToken);
      await _storage.write(key: _userKey, value: jsonEncode(user.toJson()));

      state = AuthState(
        status: AuthStatus.authenticated,
        user: user,
        tokens: tokens,
      );
      _log.i('Login successful: ${user.email}');
    } on ApiException catch (e) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: e.detail,
      );
    } catch (e) {
      _log.e('Login error: $e');
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: 'Gagal terhubung ke server. Periksa koneksi internet Anda.',
      );
    }
  }

  // ── Logout ─────────────────────────────────────

  Future<void> logout() async {
    try {
      await _api.post('/v1/auth/logout', body: {
        'refreshToken': state.tokens?.refreshToken,
      });
    } catch (_) {
      // Fire and forget
    } finally {
      await _storage.deleteAll();
      _api.clearTokens();
      state = const AuthState(status: AuthStatus.unauthenticated);
      _log.i('Logged out');
    }
  }

  // ── Refresh ────────────────────────────────────

  Future<bool> refreshTokens() async {
    try {
      final refreshToken = state.tokens?.refreshToken;
      if (refreshToken == null) return false;

      final response = await _api.post(
        '/v1/auth/refresh',
        body: {'refreshToken': refreshToken},
      );

      final data = response['data'] as Map<String, dynamic>;
      final tokens = AuthTokens.fromJson(data);

      _api.setTokens(
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      );
      await _storage.write(key: _accessTokenKey, value: tokens.accessToken);
      await _storage.write(key: _refreshTokenKey, value: tokens.refreshToken);

      state = state.copyWith(tokens: tokens);
      return true;
    } catch (e) {
      _log.e('Token refresh failed: $e');
      await logout();
      return false;
    }
  }
}

// ─────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────

final _storageProvider = Provider<FlutterSecureStorage>(
  (_) => const FlutterSecureStorage(),
);

final _loggerProvider = Provider<Logger>(
  (_) => Logger(printer: PrettyPrinter(methodCount: 0)),
);

final apiClientProvider = Provider<ApiClient>(
  (_) => ApiClient(),
);

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>(
  (ref) => AuthNotifier(
    ref.watch(apiClientProvider),
    ref.watch(_storageProvider),
    ref.watch(_loggerProvider),
  ),
);
