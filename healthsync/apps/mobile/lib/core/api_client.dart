import 'dart:convert';
import 'package:http/http.dart' as http;

/// HTTP client wrapper for the HealthSync API.
///
/// Handles:
///  - Base URL configuration
///  - JWT Authorization header injection
///  - Response parsing and error normalization
///  - Token refresh on 401
class ApiClient {
  final String baseUrl;
  String? _accessToken;
  String? _refreshToken;

  ApiClient({
    String? baseUrl,
    int? port,
    String? token,
  })  : baseUrl = baseUrl ?? _buildBaseUrl(port),
        _accessToken = token;

  static String _buildBaseUrl(int? port) {
    // Production uses the ingress/gateway URL. Local development may still
    // address individual service ports directly.
    const configuredBaseUrl = String.fromEnvironment('API_BASE_URL');
    if (configuredBaseUrl.isNotEmpty) return configuredBaseUrl;

    const host = String.fromEnvironment(
      'API_HOST',
      defaultValue: 'localhost',
    );
    final p = port ?? 3001;
    return 'http://$host:$p';
  }

  String _buildUrl(String path, int? port) {
    final base = Uri.parse(baseUrl);
    const configuredBaseUrl = String.fromEnvironment('API_BASE_URL');
    final useGateway = configuredBaseUrl.isNotEmpty || base.scheme == 'https';
    if (port != null && !useGateway) {
      return 'http://${base.host}:$port$path';
    }
    return '${baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl}$path';
  }

  // ─────────────────────────────────────────────
  // Auth token management
  // ─────────────────────────────────────────────

  void setTokens({required String accessToken, required String refreshToken}) {
    _accessToken = accessToken;
    _refreshToken = refreshToken;
    // TODO: Persist to flutter_secure_storage
  }

  void clearTokens() {
    _accessToken = null;
    _refreshToken = null;
    // TODO: Clear from flutter_secure_storage
  }

  Map<String, String> get _headers {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (_accessToken != null) {
      headers['Authorization'] = 'Bearer $_accessToken';
    }
    return headers;
  }

  // ─────────────────────────────────────────────
  // HTTP methods
  // ─────────────────────────────────────────────

  Future<Map<String, dynamic>> get(
    String path, {
    int? port,
    String? token,
  }) async {
    final url = _buildUrl(path, port);
    final hdrs = _buildHeaders(token);
    final response = await http.get(Uri.parse(url), headers: hdrs);
    return _handleRawResponse(response);
  }

  Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? body,
    int? port,
    String? token,
  }) async {
    final url = _buildUrl(path, port);
    final hdrs = _buildHeaders(token);
    final response = await http.post(
      Uri.parse(url),
      headers: hdrs,
      body: body != null ? jsonEncode(body) : null,
    );
    return _handleRawResponse(response);
  }

  Future<Map<String, dynamic>> put(
    String path, {
    Map<String, dynamic>? body,
    int? port,
    String? token,
  }) async {
    final url = _buildUrl(path, port);
    final hdrs = _buildHeaders(token);
    final response = await http.put(
      Uri.parse(url),
      headers: hdrs,
      body: body != null ? jsonEncode(body) : null,
    );
    return _handleRawResponse(response);
  }

  Future<Map<String, dynamic>> patch(
    String path, {
    Map<String, dynamic>? body,
    int? port,
    String? token,
  }) async {
    final url = _buildUrl(path, port);
    final hdrs = _buildHeaders(token);
    final response = await http.patch(
      Uri.parse(url),
      headers: hdrs,
      body: body != null ? jsonEncode(body) : null,
    );
    return _handleRawResponse(response);
  }

  Future<Map<String, dynamic>> delete(
    String path, {
    int? port,
    String? token,
  }) async {
    final url = _buildUrl(path, port);
    final hdrs = _buildHeaders(token);
    final response = await http.delete(Uri.parse(url), headers: hdrs);
    return _handleRawResponse(response);
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  Map<String, String> _buildHeaders(String? overrideToken) {
    final tok = overrideToken ?? _accessToken;
    return <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      if (tok != null) 'Authorization': 'Bearer $tok',
    };
  }

  Map<String, dynamic> _handleRawResponse(http.Response response) {
    final statusCode = response.statusCode;

    if (response.body.isEmpty) {
      return {'statusCode': statusCode, 'data': null};
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;

    if (statusCode >= 200 && statusCode < 300) {
      return {
        'statusCode': statusCode,
        'data': decoded['data'],
        'meta': decoded['meta'],
      };
    }

    // RFC 7807 Problem Details
    throw ApiException(
      statusCode: statusCode,
      title: decoded['title']?.toString() ?? 'Error',
      detail: decoded['detail']?.toString() ?? 'An error occurred',
      type: decoded['type']?.toString(),
    );
  }

  // Legacy typed wrappers kept for existing screens that use ApiResponse
  Future<ApiResponse> getTyped(String path) async {
    final result = await get(path);
    return ApiResponse(
      statusCode: result['statusCode'] as int? ?? 200,
      data: result['data'],
      meta: result['meta'] as Map<String, dynamic>?,
    );
  }
}

// ─────────────────────────────────────────────
// Response / Exception models
// ─────────────────────────────────────────────

class ApiResponse {
  final int statusCode;
  final dynamic data;
  final Map<String, dynamic>? meta;

  const ApiResponse({
    required this.statusCode,
    required this.data,
    this.meta,
  });
}

class ApiException implements Exception {
  final int statusCode;
  final String title;
  final String detail;
  final String? type;

  const ApiException({
    required this.statusCode,
    required this.title,
    required this.detail,
    this.type,
  });

  @override
  String toString() => 'ApiException[$statusCode]: $title — $detail';
}
