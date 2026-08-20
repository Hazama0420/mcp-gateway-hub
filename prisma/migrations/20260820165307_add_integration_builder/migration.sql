-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "category" TEXT,
    "base_url" TEXT NOT NULL,
    "auth_type" TEXT NOT NULL DEFAULT 'none',
    "auth_config" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationTool" (
    "id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "input_schema" JSONB,
    "headers_template" JSONB,
    "query_template" JSONB,
    "body_template" JSONB,
    "response_mapping" JSONB,
    "permission" TEXT NOT NULL DEFAULT 'read',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EndpointIntegration" (
    "id" TEXT NOT NULL,
    "endpoint_id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "encrypted_config" TEXT,
    "iv" TEXT,
    "tag" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EndpointIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Integration_slug_key" ON "Integration"("slug");

-- CreateIndex
CREATE INDEX "Integration_is_active_idx" ON "Integration"("is_active");

-- CreateIndex
CREATE INDEX "Integration_category_idx" ON "Integration"("category");

-- CreateIndex
CREATE INDEX "IntegrationTool_integration_id_idx" ON "IntegrationTool"("integration_id");

-- CreateIndex
CREATE INDEX "IntegrationTool_is_enabled_idx" ON "IntegrationTool"("is_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationTool_integration_id_name_key" ON "IntegrationTool"("integration_id", "name");

-- CreateIndex
CREATE INDEX "EndpointIntegration_endpoint_id_idx" ON "EndpointIntegration"("endpoint_id");

-- CreateIndex
CREATE INDEX "EndpointIntegration_integration_id_idx" ON "EndpointIntegration"("integration_id");

-- CreateIndex
CREATE INDEX "EndpointIntegration_is_active_idx" ON "EndpointIntegration"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "EndpointIntegration_endpoint_id_integration_id_key" ON "EndpointIntegration"("endpoint_id", "integration_id");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "EndpointService_endpoint_id_idx" ON "EndpointService"("endpoint_id");

-- CreateIndex
CREATE INDEX "ExecutionLog_endpoint_id_idx" ON "ExecutionLog"("endpoint_id");

-- CreateIndex
CREATE INDEX "ExecutionLog_created_at_idx" ON "ExecutionLog"("created_at");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "IntegrationTool" ADD CONSTRAINT "IntegrationTool_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EndpointIntegration" ADD CONSTRAINT "EndpointIntegration_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "McpEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EndpointIntegration" ADD CONSTRAINT "EndpointIntegration_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
