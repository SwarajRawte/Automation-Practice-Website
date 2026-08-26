type OpenApiObject = Record<string, any>;

const schemaRef = (name: string): OpenApiObject => ({
  $ref: `#/components/schemas/${name}`,
});

const jsonResponse = (
  description: string,
  schema?: OpenApiObject,
): OpenApiObject => ({
  description,
  ...(schema ? { content: { "application/json": { schema } } } : {}),
});

const binaryResponse = (
  description: string,
  mediaTypes: string[],
): OpenApiObject => ({
  description,
  headers: {
    "Content-Disposition": {
      description: "Attachment filename",
      schema: { type: "string" },
    },
  },
  content: Object.fromEntries(
    mediaTypes.map((mediaType) => [
      mediaType,
      {
        schema: {
          type: "string",
          ...(mediaType === "application/pdf" ? { format: "binary" } : {}),
        },
      },
    ]),
  ),
});

const requestBody = (
  schema: OpenApiObject,
  required = true,
): OpenApiObject => ({
  required,
  content: { "application/json": { schema } },
});

const multipartBody = (field: string, multiple = false): OpenApiObject => ({
  required: true,
  content: {
    "multipart/form-data": {
      schema: {
        type: "object",
        required: [field],
        properties: {
          [field]: multiple
            ? {
                type: "array",
                minItems: 1,
                maxItems: 5,
                items: { type: "string", format: "binary" },
              }
            : { type: "string", format: "binary" },
        },
      },
    },
  },
});

const errorResponseNames = {
  400: "BadRequest",
  401: "Unauthorized",
  402: "PaymentRequired",
  403: "Forbidden",
  404: "NotFound",
  408: "RequestTimeout",
  409: "Conflict",
  413: "PayloadTooLarge",
  415: "UnsupportedMediaType",
  422: "UnprocessableEntity",
  423: "Locked",
  429: "TooManyRequests",
  500: "InternalServerError",
  503: "ServiceUnavailable",
} as const;

type ErrorStatus = keyof typeof errorResponseNames;

const withErrors = (
  successful: Record<string, OpenApiObject>,
  errors: ErrorStatus[] = [],
): Record<string, OpenApiObject> => ({
  ...successful,
  ...Object.fromEntries(
    errors.map((status) => [
      String(status),
      { $ref: `#/components/responses/${errorResponseNames[status]}` },
    ]),
  ),
});

const authSecurity = [{ bearerAuth: [] }, { accessCookie: [] }];
const testSecurity = [
  { bearerAuth: [], testKey: [] },
  { accessCookie: [], testKey: [] },
];
const testKeySecurity = [{ testKey: [] }];

type OperationOptions = {
  id: string;
  tag: string | string[];
  summary: string;
  description?: string;
  parameters?: OpenApiObject[];
  body?: OpenApiObject;
  success: Record<string, OpenApiObject>;
  errors?: ErrorStatus[];
  security?: OpenApiObject[];
};

const operation = (options: OperationOptions): OpenApiObject => {
  const errors = new Set<ErrorStatus>(options.errors ?? []);
  // The run-context middleware rejects an unknown x-test-run-id before the
  // route handler, even for otherwise-public auth operations.
  if (options.parameters?.includes(runHeader)) errors.add(404);
  return {
    tags: Array.isArray(options.tag) ? options.tag : [options.tag],
    summary: options.summary,
    operationId: options.id,
    ...(options.description ? { description: options.description } : {}),
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.body ? { requestBody: options.body } : {}),
    security: options.security ?? authSecurity,
    responses: withErrors(options.success, [...errors]),
  };
};

const runHeader = { $ref: "#/components/parameters/TestRunIdHeader" };
const runCookie = { $ref: "#/components/parameters/TestRunCookie" };
const testKeyHeader = { $ref: "#/components/parameters/TestKeyHeader" };
const page = { $ref: "#/components/parameters/Page" };
const size = { $ref: "#/components/parameters/Size" };
const numericId = { $ref: "#/components/parameters/NumericId" };
const productId = { $ref: "#/components/parameters/ProductId" };
const userId = { $ref: "#/components/parameters/UserId" };
const snapshotName = { $ref: "#/components/parameters/SnapshotName" };
const testRunPathId = { $ref: "#/components/parameters/TestRunPathId" };
const testControlParameters = [testKeyHeader, runHeader];
const selectedTestControlParameters = [testKeyHeader, runHeader, runCookie];

const publicOperation = (options: OperationOptions) =>
  operation({ ...options, security: [] });
const testOperation = (options: OperationOptions) =>
  operation({ ...options, security: testSecurity });
const keyOperation = (options: OperationOptions) =>
  operation({ ...options, security: testKeySecurity });

const getStatusOperation = (method: string) =>
  operation({
    id: `simulateStatus${method[0].toUpperCase()}${method.slice(1)}`,
    tag: "Simulation",
    summary: `Return a caller-selected status for HTTP ${method.toUpperCase()}`,
    success: {
      default: jsonResponse(
        "Requested status; 204 has no body and other statuses return the simulation envelope",
        schemaRef("StatusSimulation"),
      ),
    },
    errors: [401, 404, 422],
  });

const getEchoOperation = (method: string) =>
  operation({
    id: `networkEcho${method[0].toUpperCase()}${method.slice(1)}`,
    tag: "Network",
    summary: `Exercise the network simulator with HTTP ${method.toUpperCase()}`,
    parameters: [runHeader],
    ...(method === "post" || method === "put" || method === "patch"
      ? {
          body: requestBody(
            { type: "object", additionalProperties: true },
            false,
          ),
        }
      : {}),
    success: {
      "200": jsonResponse("Echo completed", schemaRef("NetworkEcho")),
      default: jsonResponse(
        "Status selected by the network simulator",
        schemaRef("StatusSimulation"),
      ),
    },
    errors: [401, 429, 503],
  });

const paths: Record<string, OpenApiObject> = {
  "/api/health": {
    get: publicOperation({
      id: "getHealth",
      tag: "Health",
      summary: "Report process health and test-mode state",
      success: {
        "200": jsonResponse("Application is running", schemaRef("Health")),
      },
    }),
  },
  "/api/ready": {
    get: publicOperation({
      id: "getReadiness",
      tag: "Health",
      summary: "Report whether the application is ready to receive traffic",
      description:
        "Probes the primary SQLite database without exposing dependency error details.",
      success: {
        "200": jsonResponse(
          "Application and database are ready",
          schemaRef("ReadinessReady"),
        ),
        "503": jsonResponse(
          "The database readiness check failed",
          schemaRef("ReadinessNotReady"),
        ),
      },
    }),
  },
  "/api/auth/register": {
    post: publicOperation({
      id: "registerUser",
      tag: "Authentication",
      summary: "Register an unverified test user",
      parameters: [runHeader],
      body: requestBody(schemaRef("RegisterRequest")),
      success: {
        "201": jsonResponse("User registered", schemaRef("Registration")),
      },
      errors: [409, 422, 429, 503],
    }),
  },
  "/api/auth/verify": {
    post: publicOperation({
      id: "verifyEmail",
      tag: "Authentication",
      summary: "Verify a registered email address",
      parameters: [runHeader],
      body: requestBody(schemaRef("TokenRequest")),
      success: {
        "200": jsonResponse("Email verified", schemaRef("Message")),
      },
      errors: [400],
    }),
  },
  "/api/auth/login": {
    post: publicOperation({
      id: "login",
      tag: "Authentication",
      summary: "Authenticate and rotate the single-device session",
      parameters: [runHeader],
      body: requestBody(schemaRef("LoginRequest")),
      success: {
        "200": jsonResponse("Authenticated", schemaRef("AuthSession")),
      },
      errors: [401, 403, 409, 422, 423, 429],
    }),
  },
  "/api/auth/refresh": {
    post: publicOperation({
      id: "refreshSession",
      tag: "Authentication",
      summary: "Rotate a refresh token and issue a new access token",
      parameters: [runHeader],
      body: requestBody(schemaRef("RefreshRequest"), false),
      success: {
        "200": jsonResponse("Session refreshed", schemaRef("TokenPair")),
      },
      errors: [401, 423],
    }),
  },
  "/api/auth/logout": {
    post: publicOperation({
      id: "logout",
      tag: "Authentication",
      summary: "Revoke the current session and clear auth cookies",
      parameters: [runHeader],
      body: requestBody(schemaRef("RefreshRequest"), false),
      success: {
        "200": jsonResponse("Logged out", schemaRef("Message")),
      },
    }),
  },
  "/api/auth/forgot": {
    post: publicOperation({
      id: "forgotPassword",
      tag: "Authentication",
      summary: "Simulate a password-reset email",
      parameters: [runHeader],
      body: requestBody(schemaRef("EmailRequest"), false),
      success: {
        "200": jsonResponse(
          "Recovery simulation accepted",
          schemaRef("RecoveryResponse"),
        ),
      },
      errors: [503],
    }),
  },
  "/api/auth/forgot-password": {
    post: publicOperation({
      id: "forgotPasswordAlias",
      tag: "Authentication",
      summary: "Simulate a password-reset email (compatibility alias)",
      parameters: [runHeader],
      body: requestBody(schemaRef("EmailRequest"), false),
      success: {
        "200": jsonResponse(
          "Recovery simulation accepted",
          schemaRef("RecoveryResponse"),
        ),
      },
      errors: [503],
    }),
  },
  "/api/auth/reset-password": {
    post: publicOperation({
      id: "resetPassword",
      tag: "Authentication",
      summary: "Consume a reset token and replace the password",
      parameters: [runHeader],
      body: requestBody(schemaRef("ResetPasswordRequest")),
      success: {
        "200": jsonResponse("Password reset", schemaRef("Message")),
      },
      errors: [400, 409, 422],
    }),
  },
  "/api/auth/me": {
    get: operation({
      id: "getCurrentUser",
      tag: "Authentication",
      summary: "Return the authenticated user",
      parameters: [runHeader],
      success: { "200": jsonResponse("Current user", schemaRef("User")) },
      errors: [401, 404],
    }),
  },
  "/api/auth/session": {
    get: operation({
      id: "getSession",
      tag: "Authentication",
      summary: "Resolve the cookie or bearer session",
      parameters: [runHeader],
      success: {
        "200": jsonResponse("Active session", schemaRef("SessionUser")),
      },
      errors: [401],
    }),
  },
  "/api/auth/change-password": {
    post: operation({
      id: "changePassword",
      tag: "Authentication",
      summary: "Change the authenticated user's password",
      parameters: [runHeader],
      body: requestBody(schemaRef("ChangePasswordRequest")),
      success: {
        "200": jsonResponse("Password changed", schemaRef("PasswordChanged")),
      },
      errors: [400, 401, 409, 422],
    }),
  },
  "/api/forms": {
    post: operation({
      id: "createFormSubmission",
      tag: "Forms",
      summary: "Validate and store a form submission",
      description:
        "Requires the ADMIN or USER role. Password-shaped fields are redacted before storage.",
      parameters: [runHeader],
      body: requestBody(schemaRef("FormSubmissionRequest")),
      success: {
        "201": jsonResponse("Form stored", schemaRef("FormSubmission")),
      },
      errors: [401, 403, 422],
    }),
  },
  "/api/forms/{id}": {
    parameters: [numericId],
    get: operation({
      id: "getFormSubmission",
      tag: "Forms",
      summary: "Return an owned form submission",
      parameters: [runHeader],
      success: {
        "200": jsonResponse(
          "Owned form submission",
          schemaRef("StoredFormSubmission"),
        ),
      },
      errors: [401, 404],
    }),
  },
  "/api/table-users": {
    get: operation({
      id: "listTableUsers",
      tag: "Users",
      summary: "List deterministic table users",
      parameters: [
        runHeader,
        page,
        size,
        { name: "search", in: "query", schema: { type: "string" } },
        {
          name: "status",
          in: "query",
          schema: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
        },
        { name: "department", in: "query", schema: { type: "string" } },
        {
          name: "sort",
          in: "query",
          schema: {
            type: "string",
            enum: ["id", "name", "email", "department", "status", "score"],
          },
        },
        {
          name: "direction",
          in: "query",
          schema: { type: "string", enum: ["asc", "desc"] },
        },
        {
          name: "sorts",
          in: "query",
          description: "Comma-separated key:direction clauses",
          schema: { type: "string" },
        },
      ],
      success: {
        "200": jsonResponse("Paginated users", schemaRef("TableUserPage")),
      },
      errors: [401],
    }),
  },
  "/api/users": {
    get: operation({
      id: "listUsers",
      tag: ["Users", "Administration"],
      summary: "List generated users",
      description: "Requires the ADMIN role.",
      parameters: [runHeader, page, size],
      success: {
        "200": jsonResponse("Generated users", schemaRef("GeneratedUserPage")),
      },
      errors: [401, 403],
    }),
  },
  "/api/products": {
    get: operation({
      id: "listProducts",
      tag: "Catalog",
      summary: "List catalog products",
      parameters: [
        runHeader,
        page,
        size,
        { name: "q", in: "query", schema: { type: "string" } },
        { name: "category", in: "query", schema: { type: "string" } },
        { name: "status", in: "query", schema: { type: "string" } },
        {
          name: "sort",
          in: "query",
          schema: {
            type: "string",
            enum: ["id", "name", "price", "inventory", "updated_at"],
          },
        },
        {
          name: "direction",
          in: "query",
          schema: { type: "string", enum: ["asc", "desc"] },
        },
      ],
      success: {
        "200": jsonResponse("Paginated products", schemaRef("ProductPage")),
      },
      errors: [401],
    }),
    post: operation({
      id: "createProduct",
      tag: "Catalog",
      summary: "Create a catalog product",
      description: "Requires the ADMIN role.",
      parameters: [runHeader],
      body: requestBody(schemaRef("ProductWrite")),
      success: {
        "201": jsonResponse("Product created", schemaRef("Product")),
      },
      errors: [401, 403, 409, 422],
    }),
  },
  "/api/products/{id}": {
    parameters: [numericId],
    get: operation({
      id: "getProduct",
      tag: "Catalog",
      summary: "Get a catalog product",
      parameters: [runHeader],
      success: { "200": jsonResponse("Product", schemaRef("Product")) },
      errors: [401, 404],
    }),
    put: operation({
      id: "updateProduct",
      tag: "Catalog",
      summary: "Replace a product using optimistic concurrency",
      description:
        "Requires the ADMIN role and the current version in the request body.",
      parameters: [runHeader],
      body: requestBody(schemaRef("ProductUpdate")),
      success: {
        "200": jsonResponse("Updated product", schemaRef("Product")),
      },
      errors: [401, 403, 404, 409, 422],
    }),
    delete: operation({
      id: "deleteProduct",
      tag: "Catalog",
      summary: "Soft-delete a product",
      description: "Requires the ADMIN role.",
      parameters: [runHeader],
      success: {
        "200": jsonResponse("Product deleted", schemaRef("ProductDeleted")),
      },
      errors: [401, 403, 404],
    }),
  },
  "/api/products/{id}/duplicate": {
    parameters: [numericId],
    post: operation({
      id: "duplicateProduct",
      tag: "Catalog",
      summary: "Duplicate a product under a unique copy name",
      description: "Requires the ADMIN role.",
      parameters: [runHeader],
      success: {
        "201": jsonResponse("Product duplicated", schemaRef("Product")),
      },
      errors: [401, 403, 404],
    }),
  },
  "/api/products/{id}/undo": {
    parameters: [numericId],
    post: operation({
      id: "restoreProduct",
      tag: "Catalog",
      summary: "Restore a soft-deleted product",
      description: "Requires the ADMIN role.",
      parameters: [runHeader],
      body: requestBody(schemaRef("UndoProductRequest")),
      success: {
        "200": jsonResponse("Product restored", schemaRef("Product")),
      },
      errors: [400, 401, 403, 404, 409],
    }),
  },
  "/api/products/{id}/history": {
    parameters: [numericId],
    get: operation({
      id: "listProductHistory",
      tag: "Catalog",
      summary: "List product history records",
      parameters: [runHeader],
      success: {
        "200": jsonResponse("Product history", schemaRef("ProductHistoryList")),
      },
      errors: [401],
    }),
  },
  "/api/products/{id}/image": {
    parameters: [numericId],
    post: operation({
      id: "uploadProductImage",
      tag: ["Catalog", "Files"],
      summary: "Attach a PNG or JPEG image to a product",
      description: "Requires the ADMIN role. The image limit is 5 MB.",
      parameters: [runHeader],
      body: multipartBody("image"),
      success: {
        "200": jsonResponse("Image attached", schemaRef("Product")),
      },
      errors: [401, 403, 404, 413, 415, 422],
    }),
  },
  "/api/files": {
    get: operation({
      id: "listFiles",
      tag: "Files",
      summary: "List files owned by the authenticated user",
      parameters: [runHeader],
      success: { "200": jsonResponse("Owned files", schemaRef("FileList")) },
      errors: [401],
    }),
  },
  "/api/files/upload": {
    post: operation({
      id: "uploadFiles",
      tag: "Files",
      summary: "Upload up to five files",
      description:
        "Requires the ADMIN or USER role. Each file is limited to 5 MB.",
      parameters: [
        runHeader,
        {
          name: "fail",
          in: "query",
          description: "Set to true for a deterministic 503 failure",
          schema: { type: "boolean" },
        },
      ],
      body: multipartBody("files", true),
      success: {
        "201": jsonResponse("Files uploaded", schemaRef("UploadResponse")),
      },
      errors: [401, 403, 409, 413, 415, 422, 503],
    }),
  },
  "/api/files/{id}": {
    parameters: [numericId],
    delete: operation({
      id: "deleteFile",
      tag: "Files",
      summary: "Delete an owned, unreferenced file",
      description: "Requires the ADMIN or USER role.",
      parameters: [runHeader],
      success: { "204": { description: "File deleted" } },
      errors: [401, 403, 404, 409],
    }),
  },
  "/api/files/process-csv": {
    post: operation({
      id: "processCsv",
      tag: "Files",
      summary: "Parse a CSV upload and return a preview",
      parameters: [runHeader],
      body: multipartBody("file"),
      success: {
        "200": jsonResponse("CSV summary", schemaRef("CsvPreview")),
      },
      errors: [401, 413, 415, 422],
    }),
  },
  "/api/files/download/{type}": {
    parameters: [
      {
        name: "type",
        in: "path",
        required: true,
        description:
          "csv, pdf, invoice, delayed, failed, or another value for text",
        schema: { type: "string" },
      },
    ],
    get: operation({
      id: "downloadTypedFile",
      tag: "Files",
      summary: "Download deterministic sample content",
      parameters: [runHeader],
      success: {
        "200": binaryResponse("CSV, PDF, or text attachment", [
          "text/plain",
          "text/csv",
          "application/pdf",
        ]),
      },
      errors: [401, 500],
    }),
  },
  "/api/files/download": {
    get: operation({
      id: "downloadFile",
      tag: "Files",
      summary: "Download a deterministic text attachment",
      parameters: [runHeader],
      success: {
        "200": binaryResponse("Text attachment", ["text/plain"]),
      },
      errors: [401],
    }),
  },
  "/api/shop/products": {
    get: operation({
      id: "listShopProducts",
      tag: "Shop",
      summary: "Search and sort purchasable products",
      parameters: [
        runHeader,
        { name: "q", in: "query", schema: { type: "string" } },
        { name: "category", in: "query", schema: { type: "string" } },
        {
          name: "min",
          in: "query",
          schema: { type: "number", minimum: 0 },
        },
        {
          name: "max",
          in: "query",
          schema: { type: "number", minimum: 0 },
        },
        {
          name: "sort",
          in: "query",
          schema: {
            type: "string",
            enum: ["name", "price_asc", "price_desc", "rating"],
          },
        },
      ],
      success: {
        "200": jsonResponse("Shop products", schemaRef("ShopProductList")),
      },
      errors: [401, 404, 422],
    }),
  },
  "/api/shop/products/{id}": {
    parameters: [numericId],
    get: operation({
      id: "getShopProduct",
      tag: "Shop",
      summary: "Get a purchasable product",
      parameters: [runHeader],
      success: {
        "200": jsonResponse("Shop product", schemaRef("ShopProduct")),
      },
      errors: [401, 404],
    }),
  },
  "/api/shop/wishlist": {
    get: operation({
      id: "getWishlist",
      tag: "Shop",
      summary: "List the current user's wishlist",
      parameters: [runHeader],
      success: {
        "200": jsonResponse("Wishlist", schemaRef("ProductList")),
      },
      errors: [401],
    }),
  },
  "/api/shop/wishlist/{productId}": {
    parameters: [productId],
    post: operation({
      id: "addWishlistProduct",
      tag: "Shop",
      summary: "Add a product to the wishlist",
      description: "Requires the ADMIN or USER role.",
      parameters: [runHeader],
      success: {
        "200": jsonResponse(
          "Product already present",
          schemaRef("WishlistMutation"),
        ),
        "201": jsonResponse("Product added", schemaRef("WishlistMutation")),
      },
      errors: [401, 403, 404, 422],
    }),
    delete: operation({
      id: "removeWishlistProduct",
      tag: "Shop",
      summary: "Remove a product from the wishlist",
      description: "Requires the ADMIN or USER role.",
      parameters: [runHeader],
      success: { "204": { description: "Product removed or already absent" } },
      errors: [401, 403],
    }),
  },
  "/api/shop/checkout": {
    post: operation({
      id: "checkout",
      tag: ["Shop", "Orders"],
      summary: "Validate a mock payment and create an order",
      description: "Requires the ADMIN or USER role.",
      parameters: [runHeader],
      body: requestBody(schemaRef("CheckoutRequest")),
      success: {
        "201": jsonResponse("Order created", schemaRef("CheckoutResponse")),
      },
      errors: [401, 402, 403, 408, 409, 422],
    }),
  },
  "/api/shop/orders": {
    get: operation({
      id: "listOrders",
      tag: "Orders",
      summary: "List the current user's orders",
      parameters: [runHeader],
      success: { "200": jsonResponse("Orders", schemaRef("OrderList")) },
      errors: [401],
    }),
  },
  "/api/shop/orders/{id}": {
    parameters: [numericId],
    get: operation({
      id: "getOrder",
      tag: "Orders",
      summary: "Get an owned order and its items",
      parameters: [runHeader],
      success: { "200": jsonResponse("Order", schemaRef("OrderDetail")) },
      errors: [401, 404],
    }),
  },
  "/api/shop/orders/{id}/cancel": {
    parameters: [numericId],
    post: operation({
      id: "cancelOrder",
      tag: "Orders",
      summary: "Cancel an eligible owned order",
      description: "Requires the ADMIN or USER role.",
      parameters: [runHeader],
      success: {
        "200": jsonResponse("Order cancelled", schemaRef("OrderStatus")),
      },
      errors: [401, 403, 404, 409],
    }),
  },
  "/api/network/config": {
    get: operation({
      id: "getNetworkConfig",
      tag: "Network",
      summary: "Read the active network simulator configuration",
      parameters: [runHeader],
      success: {
        "200": jsonResponse(
          "Network configuration",
          schemaRef("NetworkConfig"),
        ),
      },
      errors: [401],
    }),
    put: operation({
      id: "updateNetworkConfig",
      tag: "Network",
      summary: "Replace selected network simulator settings",
      description: "Requires the ADMIN role.",
      parameters: [runHeader],
      body: requestBody(schemaRef("NetworkConfigWrite")),
      success: {
        "200": jsonResponse(
          "Updated network configuration",
          schemaRef("NetworkConfig"),
        ),
      },
      errors: [401, 403, 422],
    }),
  },
  "/api/network/echo": {
    get: getEchoOperation("get"),
    post: getEchoOperation("post"),
    put: getEchoOperation("put"),
    patch: getEchoOperation("patch"),
    delete: getEchoOperation("delete"),
    options: getEchoOperation("options"),
    head: getEchoOperation("head"),
    trace: getEchoOperation("trace"),
  },
  "/api/admin/summary": {
    get: operation({
      id: "getAdminSummary",
      tag: "Administration",
      summary: "Return aggregate business counts",
      description: "Requires the ADMIN role.",
      parameters: [runHeader],
      success: {
        "200": jsonResponse("Aggregate summary", schemaRef("AdminSummary")),
      },
      errors: [401, 403],
    }),
  },
  "/api/admin/orders": {
    get: operation({
      id: "listAdminOrders",
      tag: ["Administration", "Orders"],
      summary: "List every order with its user email",
      description: "Requires the ADMIN role.",
      parameters: [runHeader],
      success: {
        "200": jsonResponse("All orders", schemaRef("AdminOrderList")),
      },
      errors: [401, 403],
    }),
  },
  "/api/admin/export": {
    get: operation({
      id: "exportAdminOrders",
      tag: ["Administration", "Orders"],
      summary: "Export all orders as CSV",
      description: "Requires the ADMIN role.",
      parameters: [runHeader],
      success: {
        "200": binaryResponse("Orders CSV attachment", ["text/csv"]),
      },
      errors: [401, 403],
    }),
  },
  "/api/admin/audit": {
    get: operation({
      id: "listAuditEvents",
      tag: "Administration",
      summary: "Return the latest 100 audit records",
      description: "Requires the ADMIN role.",
      parameters: [runHeader],
      success: {
        "200": jsonResponse("Audit events", schemaRef("AuditList")),
      },
      errors: [401, 403],
    }),
  },
  "/api/status/{code}": {
    parameters: [
      {
        name: "code",
        in: "path",
        required: true,
        schema: { type: "integer", minimum: 200, maximum: 599 },
      },
      runHeader,
    ],
    get: getStatusOperation("get"),
    post: getStatusOperation("post"),
    put: getStatusOperation("put"),
    patch: getStatusOperation("patch"),
    delete: getStatusOperation("delete"),
    options: getStatusOperation("options"),
    head: getStatusOperation("head"),
    trace: getStatusOperation("trace"),
  },
  "/api/delay/{ms}": {
    parameters: [
      {
        name: "ms",
        in: "path",
        required: true,
        schema: { type: "integer", minimum: 0, maximum: 10000 },
      },
    ],
    get: operation({
      id: "delayResponse",
      tag: "Simulation",
      summary: "Complete after a bounded wall-clock delay",
      parameters: [runHeader],
      success: {
        "200": jsonResponse("Delay completed", schemaRef("DelayResponse")),
      },
      errors: [401, 422],
    }),
  },
  "/api/advanced/events": {
    get: operation({
      id: "streamAdvancedEvents",
      tag: "Advanced browser",
      summary: "Stream a finite sequence of server-sent events",
      description:
        "Emits a connected event followed by the requested number of ordered lab-message events, then closes the stream.",
      parameters: [
        runHeader,
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 10, default: 4 },
        },
      ],
      success: {
        "200": {
          description: "Finite SSE stream",
          content: {
            "text/event-stream": {
              schema: { type: "string" },
              example:
                'event: connected\ndata: {"connected":true}\n\nid: 1\nevent: lab-message\ndata: {"sequence":1,"kind":"build"}\n\n',
            },
          },
        },
      },
      errors: [401, 422],
    }),
  },
  "/api/advanced/mailbox": {
    get: operation({
      id: "listMockMailbox",
      tag: "Advanced browser",
      summary: "List the current user's mock mailbox",
      description:
        "Returns readable one-time codes intentionally for local automation practice. This is a mock mailbox and must never be used as a production authentication design.",
      parameters: [runHeader],
      success: {
        "200": jsonResponse("Mock mailbox", schemaRef("MockMailbox")),
      },
      errors: [401],
    }),
    delete: operation({
      id: "clearMockMailbox",
      tag: "Advanced browser",
      summary: "Clear the current user's mock mailbox",
      parameters: [runHeader],
      success: { "204": { description: "Mock mailbox cleared" } },
      errors: [401],
    }),
  },
  "/api/advanced/mailbox/code": {
    post: operation({
      id: "issueMockOtp",
      tag: "Advanced browser",
      summary: "Issue a single-use code to the mock mailbox",
      description:
        "Invalidates prior codes and creates a cryptographically generated six-digit code that expires after five logical minutes.",
      parameters: [runHeader],
      success: {
        "201": jsonResponse("Mock code issued", schemaRef("MockOtpIssued")),
      },
      errors: [401],
    }),
  },
  "/api/advanced/mailbox/verify": {
    post: operation({
      id: "verifyMockOtp",
      tag: "Advanced browser",
      summary: "Verify the latest mock one-time code",
      description:
        "A code succeeds once. Five failed attempts exhaust it until the caller requests a replacement code.",
      parameters: [runHeader],
      body: requestBody(schemaRef("MockOtpVerifyRequest")),
      success: {
        "200": jsonResponse("Mock code verified", schemaRef("MockOtpVerified")),
      },
      errors: [401, 422, 429],
    }),
  },
  "/api/test/runs": {
    post: keyOperation({
      id: "createTestRun",
      tag: "Test runs",
      summary: "Create an isolated test run",
      description:
        "Available only in TEST_MODE. Sets the test_run cookie and returns seeded actor credentials.",
      parameters: [testKeyHeader],
      body: requestBody(schemaRef("CreateTestRunRequest"), false),
      success: {
        "201": jsonResponse("Test run created", schemaRef("TestRunCreated")),
      },
      errors: [403, 404, 422, 429],
    }),
    get: keyOperation({
      id: "listTestRuns",
      tag: "Test runs",
      summary: "List active isolated test runs",
      description: "Available only in TEST_MODE.",
      parameters: [testKeyHeader],
      success: {
        "200": jsonResponse("Active test runs", schemaRef("TestRunList")),
      },
      errors: [403, 404],
    }),
  },
  "/api/test/runs/{id}": {
    parameters: [testRunPathId],
    delete: keyOperation({
      id: "deleteTestRun",
      tag: "Test runs",
      summary: "Delete an idle isolated test run",
      description: "Available only in TEST_MODE.",
      parameters: [testKeyHeader],
      success: { "204": { description: "Test run deleted" } },
      errors: [403, 404, 409],
    }),
  },
  "/api/test/clock": {
    get: testOperation({
      id: "getTestClock",
      tag: "Test state",
      summary: "Read the selected run's logical clock",
      description:
        "Requires an ADMIN session and test-control key; available only in TEST_MODE.",
      parameters: testControlParameters,
      success: {
        "200": jsonResponse("Logical clock", schemaRef("ClockEnvelope")),
      },
      errors: [401, 403, 404],
    }),
    post: testOperation({
      id: "updateTestClock",
      tag: "Test state",
      summary: "Freeze, advance, or unfreeze the selected logical clock",
      description:
        "Requires an ADMIN session and test-control key; available only in TEST_MODE.",
      parameters: testControlParameters,
      body: requestBody(schemaRef("ClockAction")),
      success: {
        "200": jsonResponse(
          "Updated logical clock",
          schemaRef("ClockEnvelope"),
        ),
      },
      errors: [401, 403, 404, 422],
    }),
  },
  "/api/test/reset": {
    post: testOperation({
      id: "resetTestState",
      tag: "Test state",
      summary: "Reset the selected database and simulator state",
      description:
        "Requires an ADMIN session and test-control key; available only in TEST_MODE.",
      parameters: testControlParameters,
      success: {
        "200": jsonResponse("Database reset", schemaRef("Message")),
      },
      errors: [401, 403, 404],
    }),
  },
  "/api/test/seed": {
    post: testOperation({
      id: "seedTestState",
      tag: "Test state",
      summary: "Idempotently seed the selected database",
      description:
        "Requires an ADMIN session and test-control key; available only in TEST_MODE.",
      parameters: testControlParameters,
      success: {
        "200": jsonResponse("Database seeded", schemaRef("Message")),
      },
      errors: [401, 403, 404],
    }),
  },
  "/api/test/network": {
    post: testOperation({
      id: "configureTestNetwork",
      tag: ["Test state", "Network"],
      summary: "Configure the selected run's network simulator",
      description:
        "Requires an ADMIN session and test-control key; available only in TEST_MODE.",
      parameters: testControlParameters,
      body: requestBody(schemaRef("NetworkConfigWrite")),
      success: {
        "200": jsonResponse(
          "Network configured",
          schemaRef("NetworkConfigEnvelope"),
        ),
      },
      errors: [401, 403, 404, 422],
    }),
  },
  "/api/test/events": {
    post: testOperation({
      id: "broadcastTestEvent",
      tag: "Test state",
      summary: "Broadcast a Socket.IO test event to the selected run",
      description:
        "Requires an ADMIN session and test-control key; available only in TEST_MODE.",
      parameters: testControlParameters,
      body: requestBody({}, false),
      success: {
        "200": jsonResponse("Event sent", schemaRef("EventSent")),
      },
      errors: [401, 403, 404],
    }),
  },
  "/api/test/users/{id}/lock": {
    parameters: [numericId],
    post: testOperation({
      id: "setTestUserLock",
      tag: ["Test state", "Users"],
      summary: "Lock or unlock a seeded user",
      description:
        "Requires an ADMIN session and test-control key; available only in TEST_MODE.",
      parameters: testControlParameters,
      body: requestBody(schemaRef("UserLockRequest"), false),
      success: {
        "200": jsonResponse(
          "Lock state changed",
          schemaRef("UserLockResponse"),
        ),
      },
      errors: [401, 403, 404],
    }),
  },
  "/api/test/sessions/{userId}/expire": {
    parameters: [userId],
    post: testOperation({
      id: "expireTestUserSessions",
      tag: ["Test state", "Authentication"],
      summary: "Expire all sessions for a user",
      description:
        "Requires an ADMIN session and test-control key; available only in TEST_MODE.",
      parameters: testControlParameters,
      success: {
        "200": jsonResponse("Sessions expired", schemaRef("SessionsExpired")),
      },
      errors: [401, 403, 404],
    }),
  },
  "/api/test/snapshots": {
    get: testOperation({
      id: "listTestSnapshots",
      tag: "Test state",
      summary: "List database snapshots for the selected run",
      description:
        "Requires an ADMIN session, test-control key, and a run selected by header or cookie.",
      parameters: selectedTestControlParameters,
      success: {
        "200": jsonResponse("Snapshot names", schemaRef("SnapshotList")),
      },
      errors: [401, 403, 404, 409],
    }),
    post: testOperation({
      id: "createTestSnapshot",
      tag: "Test state",
      summary: "Capture or replace a named database snapshot",
      description:
        "Requires an ADMIN session, test-control key, and a run selected by header or cookie.",
      parameters: selectedTestControlParameters,
      body: requestBody(schemaRef("SnapshotCreateRequest")),
      success: {
        "201": jsonResponse("Snapshot captured", schemaRef("SnapshotCreated")),
      },
      errors: [401, 403, 404, 409, 413, 422, 429],
    }),
  },
  "/api/test/snapshots/{name}/restore": {
    parameters: [snapshotName],
    post: testOperation({
      id: "restoreTestSnapshot",
      tag: "Test state",
      summary: "Restore a database snapshot without restoring sessions",
      description:
        "Requires an ADMIN session, test-control key, and a run selected by header or cookie.",
      parameters: selectedTestControlParameters,
      success: {
        "200": jsonResponse("Snapshot restored", schemaRef("SnapshotRestored")),
      },
      errors: [401, 403, 404, 409],
    }),
  },
  "/api/test/snapshots/{name}": {
    parameters: [snapshotName],
    delete: testOperation({
      id: "deleteTestSnapshot",
      tag: "Test state",
      summary: "Delete a database snapshot",
      description:
        "Requires an ADMIN session, test-control key, and a run selected by header or cookie.",
      parameters: selectedTestControlParameters,
      success: { "204": { description: "Snapshot deleted" } },
      errors: [401, 403, 404],
    }),
  },
  "/api/test/reset/{module}": {
    parameters: [
      {
        name: "module",
        in: "path",
        required: true,
        schema: {
          type: "string",
          enum: ["auth", "forms", "catalog", "shop", "uploads"],
        },
      },
    ],
    post: testOperation({
      id: "resetTestModule",
      tag: "Test state",
      summary: "Reset one data module",
      description:
        "Requires an ADMIN session and test-control key; a run header selects isolated state when present.",
      parameters: testControlParameters,
      success: {
        "200": jsonResponse("Module reset", schemaRef("ModuleReset")),
      },
      errors: [401, 403, 404, 422],
    }),
  },
};

const objectSchema = (
  properties: Record<string, OpenApiObject>,
  required: string[] = Object.keys(properties),
  additionalProperties: boolean | OpenApiObject = false,
): OpenApiObject => ({
  type: "object",
  ...(required.length ? { required } : {}),
  properties,
  additionalProperties,
});

const schemas: Record<string, OpenApiObject> = {
  Error: {
    ...objectSchema(
      {
        error: { type: "string" },
        code: { type: "string" },
        errors: {
          type: "object",
          additionalProperties: { type: "string" },
        },
        current: schemaRef("Product"),
      },
      ["error"],
      true,
    ),
  },
  Message: objectSchema({ message: { type: "string" } }),
  Health: objectSchema({
    status: { type: "string", enum: ["UP"] },
    testMode: { type: "boolean" },
  }),
  ReadinessReady: objectSchema({
    status: { type: "string", enum: ["READY"] },
    checks: objectSchema({
      database: { type: "string", enum: ["UP"] },
    }),
  }),
  ReadinessNotReady: objectSchema({
    status: { type: "string", enum: ["NOT_READY"] },
    checks: objectSchema({
      database: { type: "string", enum: ["DOWN"] },
    }),
  }),
  Role: { type: "string", enum: ["ADMIN", "USER", "VIEWER"] },
  User: objectSchema({
    id: { oneOf: [{ type: "integer" }, { type: "string" }] },
    email: { type: "string", format: "email" },
    name: { type: "string" },
    role: schemaRef("Role"),
    verified: { type: "boolean" },
    locked: { type: "boolean" },
  }),
  RegisterRequest: objectSchema({
    email: { type: "string", format: "email" },
    name: { type: "string", minLength: 1, maxLength: 100 },
    password: {
      type: "string",
      format: "password",
      minLength: 8,
      maxLength: 72,
    },
  }),
  Registration: objectSchema(
    {
      user: schemaRef("User"),
      verificationToken: {
        type: "string",
        description: "Present only in TEST_MODE",
      },
      message: { type: "string" },
    },
    ["user", "message"],
  ),
  TokenRequest: objectSchema({ token: { type: "string" } }),
  LoginRequest: objectSchema(
    {
      email: { type: "string", format: "email" },
      password: { type: "string", format: "password" },
      rememberMe: { type: "boolean" },
      remember: { type: "boolean", deprecated: true },
    },
    ["email", "password"],
  ),
  AuthSession: objectSchema(
    {
      token: { type: "string" },
      refreshToken: {
        type: "string",
        description: "Present only in TEST_MODE",
      },
      user: schemaRef("User"),
      expiresIn: { type: "integer", example: 900 },
    },
    ["token", "user", "expiresIn"],
  ),
  RefreshRequest: objectSchema(
    {
      refreshToken: {
        type: "string",
        description:
          "Optional when the HttpOnly refresh_token cookie is present",
      },
    },
    [],
  ),
  TokenPair: objectSchema(
    {
      token: { type: "string" },
      refreshToken: {
        type: "string",
        description: "Present only in TEST_MODE",
      },
      expiresIn: { type: "integer", example: 900 },
    },
    ["token", "expiresIn"],
  ),
  EmailRequest: objectSchema(
    { email: { type: "string", format: "email" } },
    [],
  ),
  RecoveryResponse: objectSchema(
    {
      message: { type: "string" },
      resetToken: {
        type: "string",
        description: "Present in TEST_MODE when the account exists",
      },
    },
    ["message"],
  ),
  ResetPasswordRequest: objectSchema({
    token: { type: "string" },
    password: {
      type: "string",
      format: "password",
      minLength: 8,
      maxLength: 72,
    },
  }),
  SessionUser: objectSchema({ user: schemaRef("User") }),
  ChangePasswordRequest: objectSchema({
    currentPassword: { type: "string", format: "password" },
    newPassword: {
      type: "string",
      format: "password",
      minLength: 8,
      maxLength: 72,
    },
  }),
  PasswordChanged: objectSchema({
    message: { type: "string" },
    reauthenticate: { type: "boolean", enum: [true] },
  }),
  FormSubmissionRequest: objectSchema(
    {
      name: { type: "string", minLength: 2, maxLength: 50 },
      email: { type: "string", format: "email" },
      password: { type: "string", format: "password", minLength: 8 },
      confirmPassword: { type: "string", format: "password" },
      quantity: { type: "integer", minimum: 1, maximum: 10 },
      employment: { type: "string" },
      company: { type: "string" },
      startDate: { type: "string", format: "date" },
      endDate: { type: "string", format: "date" },
    },
    ["name", "email", "password", "confirmPassword"],
    true,
  ),
  FormSubmission: objectSchema({
    id: { type: "integer" },
    data: { type: "object", additionalProperties: true },
    message: { type: "string" },
  }),
  StoredFormSubmission: objectSchema({
    id: { type: "integer" },
    data: { type: "object", additionalProperties: true },
    createdAt: { type: "string", format: "date-time" },
  }),
  TableUser: objectSchema({
    id: { type: "integer" },
    name: { type: "string" },
    email: { type: "string", format: "email" },
    department: { type: "string" },
    role: schemaRef("Role"),
    status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
    score: { type: "integer" },
  }),
  TableUserPage: objectSchema({
    data: { type: "array", items: schemaRef("TableUser") },
    page: { type: "integer" },
    size: { type: "integer" },
    total: { type: "integer" },
    totalPages: { type: "integer" },
  }),
  GeneratedUser: objectSchema({
    id: { type: "integer" },
    email: { type: "string", format: "email" },
    name: { type: "string" },
    role: schemaRef("Role"),
    status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
  }),
  GeneratedUserPage: objectSchema({
    data: { type: "array", items: schemaRef("GeneratedUser") },
    page: { type: "integer" },
    size: { type: "integer" },
    total: { type: "integer", enum: [100] },
  }),
  Product: objectSchema({
    id: { type: "integer" },
    name: { type: "string" },
    category: { type: "string" },
    price: { type: "number", minimum: 0 },
    inventory: { type: "integer", minimum: 0 },
    status: { type: "string" },
    version: { type: "integer", minimum: 1 },
    updated_at: { type: "string", format: "date-time" },
    deleted_at: { type: "string", format: "date-time", nullable: true },
    image_file_id: { type: "integer", nullable: true },
  }),
  ProductWrite: objectSchema(
    {
      name: { type: "string", minLength: 1 },
      category: { type: "string", minLength: 1 },
      price: { type: "number", minimum: 0 },
      inventory: { type: "integer", minimum: 0 },
      status: { type: "string", default: "ACTIVE" },
    },
    ["name", "category", "price", "inventory"],
  ),
  ProductUpdate: {
    allOf: [
      schemaRef("ProductWrite"),
      objectSchema({ version: { type: "integer", minimum: 1 } }),
    ],
  },
  ProductPage: objectSchema({
    data: { type: "array", items: schemaRef("Product") },
    page: { type: "integer" },
    size: { type: "integer" },
    total: { type: "integer" },
    totalPages: { type: "integer" },
  }),
  ProductList: objectSchema({
    data: { type: "array", items: schemaRef("Product") },
  }),
  ProductDeleted: objectSchema({
    message: { type: "string" },
    undoToken: { type: "string", pattern: "^UNDO-PRODUCT-[0-9]+$" },
  }),
  UndoProductRequest: objectSchema({ undoToken: { type: "string" } }),
  ProductHistory: objectSchema({
    id: { type: "integer" },
    product_id: { type: "integer" },
    action: { type: "string" },
    snapshot: { type: "object", additionalProperties: true },
    created_at: { type: "string", format: "date-time" },
  }),
  ProductHistoryList: objectSchema({
    data: { type: "array", items: schemaRef("ProductHistory") },
  }),
  UploadedFile: objectSchema(
    {
      id: { type: "integer" },
      name: { type: "string" },
      size: { type: "integer", minimum: 1 },
      type: { type: "string" },
      created_at: { type: "string", format: "date-time" },
      preview: { type: "boolean" },
    },
    ["id", "name", "size", "type"],
  ),
  UploadResponse: objectSchema({
    files: { type: "array", items: schemaRef("UploadedFile") },
  }),
  FileList: objectSchema({
    data: { type: "array", items: schemaRef("UploadedFile") },
  }),
  CsvPreview: objectSchema({
    headers: { type: "array", items: { type: "string" } },
    rows: { type: "integer", minimum: 0 },
    preview: {
      type: "array",
      maxItems: 3,
      items: { type: "array", items: { type: "string" } },
    },
  }),
  ShopProduct: {
    allOf: [
      schemaRef("Product"),
      objectSchema({
        rating: { type: "integer", minimum: 1, maximum: 5 },
      }),
    ],
  },
  ShopProductList: objectSchema({
    data: { type: "array", items: schemaRef("ShopProduct") },
    total: { type: "integer" },
  }),
  WishlistMutation: objectSchema({
    added: { type: "boolean" },
    productId: { type: "integer" },
  }),
  CheckoutItem: objectSchema({
    productId: { type: "integer", minimum: 1 },
    quantity: { type: "integer", minimum: 1 },
  }),
  ShippingAddress: objectSchema(
    {
      line1: { type: "string", minLength: 1 },
      city: { type: "string", minLength: 1 },
    },
    ["line1", "city"],
    true,
  ),
  CheckoutRequest: objectSchema(
    {
      items: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: schemaRef("CheckoutItem"),
      },
      shippingAddress: schemaRef("ShippingAddress"),
      shippingMethod: {
        type: "string",
        enum: ["standard", "express"],
        default: "standard",
      },
      discountCode: { type: "string", enum: ["SAVE10"] },
      cardNumber: {
        type: "string",
        description:
          "4111111111111111 succeeds; 4000000000000002 declines; 4000000000009995 times out.",
      },
    },
    ["items", "shippingAddress", "cardNumber"],
  ),
  CheckoutResponse: objectSchema({
    orderId: { type: "integer" },
    status: { type: "string", enum: ["CONFIRMED"] },
    subtotal: { type: "number" },
    discount: { type: "number" },
    shipping: { type: "number" },
    tax: { type: "number" },
    total: { type: "number" },
    message: { type: "string" },
  }),
  Order: objectSchema({
    id: { type: "integer" },
    user_id: { type: "integer" },
    status: { type: "string" },
    total: { type: "number" },
    created_at: { type: "string", format: "date-time" },
  }),
  OrderItem: objectSchema({
    id: { type: "integer" },
    order_id: { type: "integer" },
    product_id: { type: "integer" },
    name: { type: "string" },
    price: { type: "number" },
    quantity: { type: "integer" },
  }),
  OrderDetail: {
    allOf: [
      schemaRef("Order"),
      objectSchema({
        items: { type: "array", items: schemaRef("OrderItem") },
      }),
    ],
  },
  OrderList: objectSchema({
    data: { type: "array", items: schemaRef("Order") },
  }),
  AdminOrder: {
    allOf: [
      schemaRef("Order"),
      objectSchema({ email: { type: "string", format: "email" } }),
    ],
  },
  AdminOrderList: objectSchema({
    data: { type: "array", items: schemaRef("AdminOrder") },
  }),
  OrderStatus: objectSchema({
    id: { type: "integer" },
    status: { type: "string", enum: ["CANCELLED"] },
  }),
  NetworkConfig: objectSchema({
    delay: { type: "integer", minimum: 0, maximum: 5000 },
    failureRate: { type: "number", minimum: 0, maximum: 1 },
    offline: { type: "boolean" },
    statusCode: {
      type: "integer",
      minimum: 200,
      maximum: 599,
      nullable: true,
    },
    rateLimit: { type: "integer", minimum: 1, maximum: 10000 },
  }),
  NetworkConfigWrite: objectSchema(
    {
      delay: { type: "integer", minimum: 0, maximum: 5000 },
      failureRate: { type: "number", minimum: 0, maximum: 1 },
      offline: { type: "boolean" },
      statusCode: {
        description: "Use null or an empty string to clear the override.",
        oneOf: [
          {
            type: "integer",
            minimum: 200,
            maximum: 599,
            nullable: true,
          },
          { type: "string", enum: [""] },
        ],
      },
      rateLimit: { type: "integer", minimum: 1, maximum: 10000 },
    },
    [],
    true,
  ),
  NetworkConfigEnvelope: objectSchema({
    network: schemaRef("NetworkConfig"),
  }),
  NetworkEcho: objectSchema(
    {
      method: { type: "string" },
      query: { type: "object", additionalProperties: true },
      body: { description: "Echoed request body when one was supplied" },
      requestId: { type: "string" },
    },
    ["method", "query", "requestId"],
  ),
  AdminSummary: objectSchema({
    users: { type: "integer" },
    orders: { type: "integer" },
    revenue: { type: "number" },
    products: { type: "integer" },
  }),
  AuditEvent: objectSchema({
    id: { type: "integer" },
    action: { type: "string" },
    detail: { type: "string", description: "JSON-encoded detail" },
    created_at: { type: "string", format: "date-time" },
  }),
  AuditList: objectSchema({
    data: {
      type: "array",
      maxItems: 100,
      items: schemaRef("AuditEvent"),
    },
  }),
  StatusSimulation: objectSchema(
    {
      status: { type: "integer", minimum: 200, maximum: 599 },
      message: { type: "string" },
      requestId: { type: "string" },
      simulated: { type: "boolean" },
    },
    ["status"],
  ),
  DelayResponse: objectSchema({
    completed: { type: "boolean", enum: [true] },
    delay: { type: "integer", minimum: 0, maximum: 10000 },
  }),
  MockOtpMessage: objectSchema({
    id: { type: "integer", minimum: 1 },
    code: {
      type: "string",
      pattern: "^[0-9]{6}$",
      description:
        "Plaintext is intentional only in this authenticated local mock mailbox.",
    },
    expiresAt: { type: "string", format: "date-time" },
    used: { type: "boolean" },
    createdAt: { type: "string", format: "date-time" },
  }),
  MockMailbox: objectSchema({
    data: {
      type: "array",
      maxItems: 10,
      items: schemaRef("MockOtpMessage"),
    },
    total: { type: "integer", minimum: 0, maximum: 10 },
  }),
  MockOtpIssued: objectSchema({
    message: { type: "string" },
    expiresAt: { type: "string", format: "date-time" },
  }),
  MockOtpVerifyRequest: objectSchema({
    code: { type: "string", pattern: "^[0-9]{6}$" },
  }),
  MockOtpVerified: objectSchema({
    verified: { type: "boolean", enum: [true] },
    message: { type: "string" },
  }),
  TestActor: objectSchema({
    email: { type: "string", format: "email" },
    password: { type: "string" },
    role: schemaRef("Role"),
  }),
  TestRun: objectSchema(
    {
      id: { type: "string", format: "uuid" },
      label: { type: "string", maxLength: 80 },
      createdAt: { type: "string", format: "date-time" },
      lastUsedAt: { type: "string", format: "date-time" },
      expiresAt: { type: "string", format: "date-time" },
    },
    ["id", "createdAt", "lastUsedAt", "expiresAt"],
  ),
  CreateTestRunRequest: objectSchema(
    { label: { type: "string", maxLength: 80 } },
    [],
  ),
  TestRunCreated: objectSchema({
    run: schemaRef("TestRun"),
    actors: objectSchema({
      admin: schemaRef("TestActor"),
      user: schemaRef("TestActor"),
      viewer: schemaRef("TestActor"),
      locked: schemaRef("TestActor"),
    }),
  }),
  TestRunList: objectSchema({
    data: { type: "array", items: schemaRef("TestRun") },
    total: { type: "integer" },
  }),
  ClockState: objectSchema({
    mode: { type: "string", enum: ["real", "frozen"] },
    nowMs: { type: "integer" },
    now: { type: "string", format: "date-time" },
  }),
  ClockEnvelope: objectSchema({ clock: schemaRef("ClockState") }),
  ClockAction: {
    oneOf: [
      objectSchema({
        action: { type: "string", enum: ["freeze"] },
        at: { type: "string", format: "date-time" },
      }),
      objectSchema({
        action: { type: "string", enum: ["advance"] },
        milliseconds: {
          type: "integer",
          minimum: 1,
          maximum: 31536000000,
        },
      }),
      objectSchema({ action: { type: "string", enum: ["unfreeze"] } }),
      {
        ...objectSchema({ at: { type: "string", format: "date-time" } }),
        description: "Legacy shorthand for freeze",
      },
    ],
  },
  EventSent: objectSchema({ sent: { type: "boolean", enum: [true] } }),
  UserLockRequest: objectSchema(
    { locked: { type: "boolean", default: true } },
    [],
  ),
  UserLockResponse: objectSchema({
    id: { type: "integer" },
    locked: { type: "boolean" },
  }),
  SessionsExpired: objectSchema({
    userId: { type: "integer" },
    expiredSessions: { type: "integer", minimum: 0 },
  }),
  SnapshotList: objectSchema({
    data: { type: "array", items: { type: "string" } },
  }),
  SnapshotCreateRequest: objectSchema({
    name: {
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$",
    },
  }),
  SnapshotCreated: objectSchema({
    name: { type: "string" },
    bytes: { type: "integer", minimum: 0 },
  }),
  SnapshotRestored: objectSchema({
    name: { type: "string" },
    restored: { type: "boolean", enum: [true] },
  }),
  ModuleReset: objectSchema({
    module: {
      type: "string",
      enum: ["auth", "forms", "catalog", "shop", "uploads"],
    },
    reset: { type: "boolean", enum: [true] },
  }),
};

const componentResponses = Object.fromEntries(
  Object.entries({
    BadRequest: "Request is invalid",
    Unauthorized: "Authentication is missing, invalid, or expired",
    PaymentRequired: "Mock payment was declined",
    Forbidden: "The authenticated actor or test key lacks permission",
    NotFound: "The resource, endpoint, or test control was not found",
    RequestTimeout: "Mock payment timed out",
    Conflict: "The request conflicts with current state",
    PayloadTooLarge: "The request exceeds an upload or snapshot quota",
    UnsupportedMediaType: "The uploaded media type is not supported",
    UnprocessableEntity: "Request validation failed",
    Locked: "The user account is locked",
    TooManyRequests: "A rate or resource limit was reached",
    InternalServerError:
      "A deterministic failure was requested or an internal error occurred",
    ServiceUnavailable: "A simulation is disabled, offline, or failed",
  }).map(([name, description]) => [
    name,
    jsonResponse(description, schemaRef("Error")),
  ]),
);

export const spec: OpenApiObject = {
  openapi: "3.0.3",
  info: {
    title: "E2E Test Lab API",
    version: "1.0.0",
    description:
      "Deterministic API surface for authentication, forms, catalog, file, shop, network, administration, and isolated test-state exercises.",
  },
  servers: [{ url: "/", description: "Current application origin" }],
  tags: [
    { name: "Health" },
    { name: "Authentication" },
    { name: "Forms" },
    { name: "Users" },
    { name: "Catalog" },
    { name: "Files" },
    { name: "Shop" },
    { name: "Orders" },
    { name: "Network" },
    { name: "Administration" },
    { name: "Simulation" },
    { name: "Advanced browser" },
    { name: "Test runs" },
    { name: "Test state" },
  ],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Access token returned by /api/auth/login or /api/auth/refresh.",
      },
      accessCookie: {
        type: "apiKey",
        in: "cookie",
        name: "access_token",
        description: "HttpOnly access-token cookie set by login or refresh.",
      },
      testKey: {
        type: "apiKey",
        in: "header",
        name: "x-test-key",
        description:
          "Server-only TEST_CONTROL_KEY (or TEST_RUN_KEY for lifecycle routes).",
      },
    },
    parameters: {
      TestKeyHeader: {
        name: "x-test-key",
        in: "header",
        required: true,
        description:
          "Server-only test-control key. Test endpoints return 404 outside TEST_MODE.",
        schema: { type: "string", minLength: 1 },
      },
      TestRunIdHeader: {
        name: "x-test-run-id",
        in: "header",
        required: false,
        description:
          "Selects an isolated test run. The test_run cookie is used when absent.",
        schema: { type: "string", format: "uuid" },
      },
      TestRunCookie: {
        name: "test_run",
        in: "cookie",
        required: false,
        description: "Isolated run selected by POST /api/test/runs.",
        schema: { type: "string", format: "uuid" },
      },
      TestRunPathId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
      NumericId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "integer", minimum: 1 },
      },
      ProductId: {
        name: "productId",
        in: "path",
        required: true,
        schema: { type: "integer", minimum: 1 },
      },
      UserId: {
        name: "userId",
        in: "path",
        required: true,
        schema: { type: "integer", minimum: 1 },
      },
      SnapshotName: {
        name: "name",
        in: "path",
        required: true,
        schema: {
          type: "string",
          pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$",
        },
      },
      Page: {
        name: "page",
        in: "query",
        schema: { type: "integer", minimum: 1, default: 1 },
      },
      Size: {
        name: "size",
        in: "query",
        schema: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
    responses: componentResponses,
    schemas,
  },
};
