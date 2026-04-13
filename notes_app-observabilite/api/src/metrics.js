import promClient from "prom-client";

// Default metrics (process metrics)
promClient.collectDefaultMetrics();

// HTTP Requests Counter
export const httpRequestsTotal = new promClient.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
});

// HTTP Request Duration Histogram
export const httpRequestDuration = new promClient.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
});

// Middleware to track metrics
export function metricsMiddleware() {
  return (req, res, next) => {
    const start = Date.now();

    // Hook into res.end() to capture the status code
    const originalEnd = res.end;
    res.end = function (...args) {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.path;
      const status = res.statusCode;

      httpRequestsTotal.labels(req.method, route, status).inc();
      httpRequestDuration.labels(req.method, route, status).observe(duration);

      originalEnd.apply(res, args);
    };

    next();
  };
}

// Expose metrics endpoint
export async function getMetrics() {
  return promClient.register.metrics();
}
