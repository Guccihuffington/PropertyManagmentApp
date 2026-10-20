/* ============================================================================
   02_schema.sql  -  PropertyManagementDB
   Re-runnable: each table is only created if it does not already exist.
   Run AFTER 01_create_database.sql.
   ============================================================================ */

-- Required for filtered indexes / computed columns (sqlcmd defaults this OFF)
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

USE PropertyManagementDB;
GO

/* ============================================================================
   1. CORE & AUTHENTICATION
   ============================================================================ */

IF OBJECT_ID('dbo.Roles') IS NULL
CREATE TABLE dbo.Roles (
    RoleID    INT IDENTITY(1,1) CONSTRAINT PK_Roles PRIMARY KEY,
    RoleName  VARCHAR(30) NOT NULL CONSTRAINT UQ_Roles_RoleName UNIQUE  -- Tenant, PropertyManager, Contractor, Admin
);
GO

IF OBJECT_ID('dbo.Users') IS NULL
CREATE TABLE dbo.Users (
    UserID        INT IDENTITY(1,1) CONSTRAINT PK_Users PRIMARY KEY,
    RoleID        INT           NOT NULL CONSTRAINT FK_Users_Roles REFERENCES dbo.Roles(RoleID),
    Email         VARCHAR(255) NOT NULL CONSTRAINT UQ_Users_Email UNIQUE,
    PasswordHash  VARCHAR(255) NOT NULL,
    FirstName     NVARCHAR(50)  NOT NULL,
    LastName      NVARCHAR(50)  NOT NULL,
    PhoneNumber   VARCHAR(20)   NULL,
    IsActive      BIT           NOT NULL CONSTRAINT DF_Users_IsActive  DEFAULT 1,
    CreatedAt     DATETIME2     NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSDATETIME()
);
GO

IF OBJECT_ID('dbo.UserDevices') IS NULL
CREATE TABLE dbo.UserDevices (
    DeviceID      INT IDENTITY(1,1) CONSTRAINT PK_UserDevices PRIMARY KEY,
    UserID        INT          NOT NULL CONSTRAINT FK_UserDevices_Users REFERENCES dbo.Users(UserID),
    DeviceToken   VARCHAR(500) NOT NULL,
    Platform      VARCHAR(10)  NOT NULL CONSTRAINT CK_UserDevices_Platform CHECK (Platform IN ('iOS','Android','Web')),
    LastActiveAt  DATETIME2    NOT NULL CONSTRAINT DF_UserDevices_LastActiveAt DEFAULT SYSDATETIME()
);
GO

/* ============================================================================
   2. PROPERTY & LEASE MANAGEMENT
   ============================================================================ */

IF OBJECT_ID('dbo.Properties') IS NULL
CREATE TABLE dbo.Properties (
    PropertyID     INT IDENTITY(1,1) CONSTRAINT PK_Properties PRIMARY KEY,
    ManagerUserID  INT           NOT NULL CONSTRAINT FK_Properties_Users REFERENCES dbo.Users(UserID),
    PropertyName   NVARCHAR(100) NOT NULL,
    StreetAddress  NVARCHAR(200) NOT NULL,
    City           NVARCHAR(100) NOT NULL,
    State          CHAR(2)       NOT NULL,
    ZipCode        VARCHAR(10)   NOT NULL
);
GO

IF OBJECT_ID('dbo.Units') IS NULL
CREATE TABLE dbo.Units (
    UnitID      INT IDENTITY(1,1) CONSTRAINT PK_Units PRIMARY KEY,
    PropertyID  INT         NOT NULL CONSTRAINT FK_Units_Properties REFERENCES dbo.Properties(PropertyID),
    UnitNumber  VARCHAR(20) NOT NULL,
    Status      VARCHAR(20) NOT NULL CONSTRAINT DF_Units_Status DEFAULT 'Vacant'
                CONSTRAINT CK_Units_Status CHECK (Status IN ('Occupied','Vacant','Maintenance')),
    CONSTRAINT UQ_Units_Property_UnitNumber UNIQUE (PropertyID, UnitNumber)
);
GO

IF OBJECT_ID('dbo.Tenants') IS NULL
CREATE TABLE dbo.Tenants (
    TenantID          INT IDENTITY(1,1) CONSTRAINT PK_Tenants PRIMARY KEY,
    UserID            INT          NOT NULL CONSTRAINT UQ_Tenants_UserID UNIQUE
                                   CONSTRAINT FK_Tenants_Users REFERENCES dbo.Users(UserID),
    EmergencyContact  VARCHAR(200) NULL
);
GO

IF OBJECT_ID('dbo.Leases') IS NULL
CREATE TABLE dbo.Leases (
    LeaseID           INT IDENTITY(1,1) CONSTRAINT PK_Leases PRIMARY KEY,
    UnitID            INT           NOT NULL CONSTRAINT FK_Leases_Units   REFERENCES dbo.Units(UnitID),
    TenantID          INT           NOT NULL CONSTRAINT FK_Leases_Tenants REFERENCES dbo.Tenants(TenantID),
    StartDate         DATE          NOT NULL,
    EndDate           DATE          NOT NULL,
    RentAmount        DECIMAL(10,2) NOT NULL CONSTRAINT CK_Leases_RentAmount CHECK (RentAmount >= 0),
    SecurityDeposit   DECIMAL(10,2) NOT NULL CONSTRAINT DF_Leases_SecurityDeposit DEFAULT 0,
    DueDayOfMonth     INT           NOT NULL CONSTRAINT DF_Leases_DueDay DEFAULT 1
                                    CONSTRAINT CK_Leases_DueDay CHECK (DueDayOfMonth BETWEEN 1 AND 28),
    LateFeeGraceDays  INT           NOT NULL CONSTRAINT DF_Leases_GraceDays DEFAULT 3
                                    CONSTRAINT CK_Leases_GraceDays CHECK (LateFeeGraceDays >= 0),
    LateFeeAmount     DECIMAL(10,2) NOT NULL CONSTRAINT DF_Leases_LateFee DEFAULT 0,
    IsActive          BIT           NOT NULL CONSTRAINT DF_Leases_IsActive DEFAULT 1,
    CONSTRAINT CK_Leases_Dates CHECK (EndDate > StartDate)
);
GO

-- A unit can only have one active lease at a time
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Leases_OneActivePerUnit' AND object_id = OBJECT_ID('dbo.Leases'))
CREATE UNIQUE INDEX UX_Leases_OneActivePerUnit ON dbo.Leases(UnitID) WHERE IsActive = 1;
GO

/* ============================================================================
   3. FINANCIALS & RENT CHASE AUTOMATION
   ============================================================================ */

IF OBJECT_ID('dbo.RentSchedules') IS NULL
CREATE TABLE dbo.RentSchedules (
    RentScheduleID  INT IDENTITY(1,1) CONSTRAINT PK_RentSchedules PRIMARY KEY,
    LeaseID         INT           NOT NULL CONSTRAINT FK_RentSchedules_Leases REFERENCES dbo.Leases(LeaseID),
    DueDate         DATE          NOT NULL,
    BaseRentAmount  DECIMAL(10,2) NOT NULL CONSTRAINT CK_RentSchedules_Amount CHECK (BaseRentAmount >= 0),
    Status          VARCHAR(20)   NOT NULL CONSTRAINT DF_RentSchedules_Status DEFAULT 'Pending'
                    CONSTRAINT CK_RentSchedules_Status CHECK (Status IN ('Pending','Paid','PartiallyPaid','Overdue')),
    CONSTRAINT UQ_RentSchedules_Lease_DueDate UNIQUE (LeaseID, DueDate)
);
GO

IF OBJECT_ID('dbo.TenantCharges') IS NULL
CREATE TABLE dbo.TenantCharges (
    ChargeID        INT IDENTITY(1,1) CONSTRAINT PK_TenantCharges PRIMARY KEY,
    LeaseID         INT           NOT NULL CONSTRAINT FK_TenantCharges_Leases        REFERENCES dbo.Leases(LeaseID),
    RentScheduleID  INT           NULL     CONSTRAINT FK_TenantCharges_RentSchedules REFERENCES dbo.RentSchedules(RentScheduleID),
    ChargeType      VARCHAR(20)   NOT NULL CONSTRAINT CK_TenantCharges_Type CHECK (ChargeType IN ('Rent','LateFee','MaintenanceFee','Deposit')),
    ChargeAmount    DECIMAL(10,2) NOT NULL CONSTRAINT CK_TenantCharges_Amount CHECK (ChargeAmount >= 0),
    IssueDate       DATE          NOT NULL CONSTRAINT DF_TenantCharges_IssueDate DEFAULT CAST(SYSDATETIME() AS DATE),
    DueDate         DATE          NOT NULL,
    Status          VARCHAR(20)   NOT NULL CONSTRAINT DF_TenantCharges_Status DEFAULT 'Unpaid'
                    CONSTRAINT CK_TenantCharges_Status CHECK (Status IN ('Unpaid','Paid','Cancelled'))
);
GO

IF OBJECT_ID('dbo.Payments') IS NULL
CREATE TABLE dbo.Payments (
    PaymentID             INT IDENTITY(1,1) CONSTRAINT PK_Payments PRIMARY KEY,
    LeaseID               INT           NOT NULL CONSTRAINT FK_Payments_Leases  REFERENCES dbo.Leases(LeaseID),
    TenantID              INT           NOT NULL CONSTRAINT FK_Payments_Tenants REFERENCES dbo.Tenants(TenantID),
    AmountPaid            DECIMAL(10,2) NOT NULL CONSTRAINT CK_Payments_Amount CHECK (AmountPaid > 0),
    PaymentDate           DATETIME2     NOT NULL CONSTRAINT DF_Payments_Date DEFAULT SYSDATETIME(),
    PaymentMethod         VARCHAR(20)   NOT NULL CONSTRAINT CK_Payments_Method CHECK (PaymentMethod IN ('ACH','CreditCard')),
    TransactionReference  VARCHAR(100)  NULL,
    Status                VARCHAR(20)   NOT NULL CONSTRAINT DF_Payments_Status DEFAULT 'Pending'
                          CONSTRAINT CK_Payments_Status CHECK (Status IN ('Success','Failed','Pending'))
);
GO

-- Transaction references must be unique when present
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Payments_TransactionReference' AND object_id = OBJECT_ID('dbo.Payments'))
CREATE UNIQUE INDEX UX_Payments_TransactionReference ON dbo.Payments(TransactionReference) WHERE TransactionReference IS NOT NULL;
GO

IF OBJECT_ID('dbo.PaymentAllocations') IS NULL
CREATE TABLE dbo.PaymentAllocations (
    AllocationID     INT IDENTITY(1,1) CONSTRAINT PK_PaymentAllocations PRIMARY KEY,
    PaymentID        INT           NOT NULL CONSTRAINT FK_PaymentAllocations_Payments REFERENCES dbo.Payments(PaymentID),
    ChargeID         INT           NOT NULL CONSTRAINT FK_PaymentAllocations_Charges  REFERENCES dbo.TenantCharges(ChargeID),
    AllocatedAmount  DECIMAL(10,2) NOT NULL CONSTRAINT CK_PaymentAllocations_Amount CHECK (AllocatedAmount > 0),
    CONSTRAINT UQ_PaymentAllocations_Payment_Charge UNIQUE (PaymentID, ChargeID)
);
GO

IF OBJECT_ID('dbo.RentChaseLogs') IS NULL
CREATE TABLE dbo.RentChaseLogs (
    RentChaseLogID     INT IDENTITY(1,1) CONSTRAINT PK_RentChaseLogs PRIMARY KEY,
    RentScheduleID     INT         NOT NULL CONSTRAINT FK_RentChaseLogs_RentSchedules REFERENCES dbo.RentSchedules(RentScheduleID),
    CommunicationType  VARCHAR(10) NOT NULL CONSTRAINT CK_RentChaseLogs_Type CHECK (CommunicationType IN ('SMS','Email','Push')),
    StepLevel          INT         NOT NULL,   -- e.g. 1 = Day 1 Reminder, 3 = Day 3 Late Notice, 5 = Day 5+ Escalation
    SentTimestamp      DATETIME2   NOT NULL CONSTRAINT DF_RentChaseLogs_Sent DEFAULT SYSDATETIME(),
    Status             VARCHAR(10) NOT NULL CONSTRAINT CK_RentChaseLogs_Status CHECK (Status IN ('Sent','Delivered','Failed'))
);
GO

/* ============================================================================
   4. PROOF-BASED MAINTENANCE & WORKFLOWS
   ============================================================================ */

IF OBJECT_ID('dbo.MaintenanceRequests') IS NULL
CREATE TABLE dbo.MaintenanceRequests (
    RequestID    INT IDENTITY(1,1) CONSTRAINT PK_MaintenanceRequests PRIMARY KEY,
    TenantID     INT           NOT NULL CONSTRAINT FK_MaintenanceRequests_Tenants REFERENCES dbo.Tenants(TenantID),
    UnitID       INT           NOT NULL CONSTRAINT FK_MaintenanceRequests_Units   REFERENCES dbo.Units(UnitID),
    Title        NVARCHAR(150) NOT NULL,
    Description  NVARCHAR(MAX) NOT NULL,
    Category     VARCHAR(20)   NOT NULL CONSTRAINT CK_MaintenanceRequests_Category CHECK (Category IN ('Plumbing','Electrical','HVAC','General')),
    Priority     VARCHAR(20)   NOT NULL CONSTRAINT DF_MaintenanceRequests_Priority DEFAULT 'Medium'
                 CONSTRAINT CK_MaintenanceRequests_Priority CHECK (Priority IN ('Low','Medium','High','Emergency')),
    Status       VARCHAR(20)   NOT NULL CONSTRAINT DF_MaintenanceRequests_Status DEFAULT 'Submitted'
                 CONSTRAINT CK_MaintenanceRequests_Status CHECK (Status IN ('Submitted','InReview','Bidding','WorkAssigned','Completed','Rejected')),
    CreatedAt    DATETIME2     NOT NULL CONSTRAINT DF_MaintenanceRequests_CreatedAt DEFAULT SYSDATETIME()
);
GO

IF OBJECT_ID('dbo.Contractors') IS NULL
CREATE TABLE dbo.Contractors (
    ContractorID   INT IDENTITY(1,1) CONSTRAINT PK_Contractors PRIMARY KEY,
    UserID         INT           NOT NULL CONSTRAINT UQ_Contractors_UserID UNIQUE
                                 CONSTRAINT FK_Contractors_Users REFERENCES dbo.Users(UserID),
    CompanyName    NVARCHAR(150) NOT NULL,
    Specialty      VARCHAR(50)   NULL,
    LicenseNumber  VARCHAR(50)   NULL
);
GO

IF OBJECT_ID('dbo.MaintenanceProjects') IS NULL
CREATE TABLE dbo.MaintenanceProjects (
    ProjectID            INT IDENTITY(1,1) CONSTRAINT PK_MaintenanceProjects PRIMARY KEY,
    RequestID            INT         NOT NULL CONSTRAINT UQ_MaintenanceProjects_RequestID UNIQUE
                                     CONSTRAINT FK_MaintenanceProjects_Requests REFERENCES dbo.MaintenanceRequests(RequestID),
    ApprovedByManagerID  INT         NOT NULL CONSTRAINT FK_MaintenanceProjects_Users REFERENCES dbo.Users(UserID),
    BiddingDeadline      DATETIME2   NOT NULL,
    Status               VARCHAR(20) NOT NULL CONSTRAINT DF_MaintenanceProjects_Status DEFAULT 'OpenForBids'
                         CONSTRAINT CK_MaintenanceProjects_Status CHECK (Status IN ('OpenForBids','BiddingClosed','InProgress','Finished'))
);
GO

IF OBJECT_ID('dbo.ContractorBids') IS NULL
CREATE TABLE dbo.ContractorBids (
    BidID           INT IDENTITY(1,1) CONSTRAINT PK_ContractorBids PRIMARY KEY,
    ProjectID       INT           NOT NULL CONSTRAINT FK_ContractorBids_Projects    REFERENCES dbo.MaintenanceProjects(ProjectID),
    ContractorID    INT           NOT NULL CONSTRAINT FK_ContractorBids_Contractors REFERENCES dbo.Contractors(ContractorID),
    EstimatedCost   DECIMAL(10,2) NOT NULL CONSTRAINT CK_ContractorBids_Cost  CHECK (EstimatedCost >= 0),
    EstimatedHours  DECIMAL(6,2)  NOT NULL CONSTRAINT CK_ContractorBids_Hours CHECK (EstimatedHours >= 0),
    Notes           NVARCHAR(MAX) NULL,
    BidStatus       VARCHAR(20)   NOT NULL CONSTRAINT DF_ContractorBids_Status DEFAULT 'Submitted'
                    CONSTRAINT CK_ContractorBids_Status CHECK (BidStatus IN ('Submitted','Accepted','Rejected')),
    SubmittedAt     DATETIME2     NOT NULL CONSTRAINT DF_ContractorBids_SubmittedAt DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_ContractorBids_Project_Contractor UNIQUE (ProjectID, ContractorID)  -- one bid per contractor per project
);
GO

IF OBJECT_ID('dbo.WorkOrders') IS NULL
CREATE TABLE dbo.WorkOrders (
    WorkOrderID        INT IDENTITY(1,1) CONSTRAINT PK_WorkOrders PRIMARY KEY,
    ProjectID          INT         NOT NULL CONSTRAINT FK_WorkOrders_Projects    REFERENCES dbo.MaintenanceProjects(ProjectID),
    BidID              INT         NOT NULL CONSTRAINT UQ_WorkOrders_BidID UNIQUE
                                   CONSTRAINT FK_WorkOrders_Bids                 REFERENCES dbo.ContractorBids(BidID),
    ContractorID       INT         NOT NULL CONSTRAINT FK_WorkOrders_Contractors REFERENCES dbo.Contractors(ContractorID),
    ScheduledStartDate DATETIME2   NOT NULL,
    ScheduledEndDate   DATETIME2   NOT NULL,
    Status             VARCHAR(20) NOT NULL CONSTRAINT DF_WorkOrders_Status DEFAULT 'Assigned'
                       CONSTRAINT CK_WorkOrders_Status CHECK (Status IN ('Assigned','InProgress','Completed','ManagerApproved','Cancelled')),
    CONSTRAINT CK_WorkOrders_Dates CHECK (ScheduledEndDate >= ScheduledStartDate)
);
GO

IF OBJECT_ID('dbo.WorkLogs') IS NULL
CREATE TABLE dbo.WorkLogs (
    WorkLogID     INT IDENTITY(1,1) CONSTRAINT PK_WorkLogs PRIMARY KEY,
    WorkOrderID   INT       NOT NULL CONSTRAINT FK_WorkLogs_WorkOrders REFERENCES dbo.WorkOrders(WorkOrderID),
    ClockInTime   DATETIME2 NOT NULL,
    ClockOutTime  DATETIME2 NULL,
    CONSTRAINT CK_WorkLogs_Times CHECK (ClockOutTime IS NULL OR ClockOutTime > ClockInTime)
);
GO

IF OBJECT_ID('dbo.GPSRecords') IS NULL
CREATE TABLE dbo.GPSRecords (
    GPSRecordID  INT IDENTITY(1,1) CONSTRAINT PK_GPSRecords PRIMARY KEY,
    WorkLogID    INT           NOT NULL CONSTRAINT FK_GPSRecords_WorkLogs REFERENCES dbo.WorkLogs(WorkLogID),
    RecordType   VARCHAR(20)   NOT NULL CONSTRAINT CK_GPSRecords_Type CHECK (RecordType IN ('ClockIn','ClockOut','Verification')),
    Latitude     DECIMAL(10,8) NOT NULL CONSTRAINT CK_GPSRecords_Lat CHECK (Latitude  BETWEEN -90  AND 90),
    Longitude    DECIMAL(11,8) NOT NULL CONSTRAINT CK_GPSRecords_Lon CHECK (Longitude BETWEEN -180 AND 180),
    RecordedAt   DATETIME2     NOT NULL CONSTRAINT DF_GPSRecords_RecordedAt DEFAULT SYSDATETIME()  -- was "Timestamp" (reserved type name)
);
GO

IF OBJECT_ID('dbo.WorkPhotos') IS NULL
CREATE TABLE dbo.WorkPhotos (
    PhotoID      INT IDENTITY(1,1) CONSTRAINT PK_WorkPhotos PRIMARY KEY,
    WorkOrderID  INT          NULL CONSTRAINT FK_WorkPhotos_WorkOrders REFERENCES dbo.WorkOrders(WorkOrderID),
    RequestID    INT          NULL CONSTRAINT FK_WorkPhotos_Requests   REFERENCES dbo.MaintenanceRequests(RequestID),
    PhotoType    VARCHAR(20)  NOT NULL CONSTRAINT CK_WorkPhotos_Type CHECK (PhotoType IN ('TenantIssue','BeforeWork','AfterWork')),
    StorageURL   VARCHAR(500) NOT NULL,   -- Azure Blob URL
    UploadedAt   DATETIME2    NOT NULL CONSTRAINT DF_WorkPhotos_UploadedAt DEFAULT SYSDATETIME(),
    -- Tenant photos exist before a work order does, so WorkOrderID is nullable; every photo must link to at least one
    CONSTRAINT CK_WorkPhotos_HasParent CHECK (WorkOrderID IS NOT NULL OR RequestID IS NOT NULL)
);
GO

IF OBJECT_ID('dbo.WorkMaterials') IS NULL
CREATE TABLE dbo.WorkMaterials (
    MaterialID    INT IDENTITY(1,1) CONSTRAINT PK_WorkMaterials PRIMARY KEY,
    WorkOrderID   INT           NOT NULL CONSTRAINT FK_WorkMaterials_WorkOrders REFERENCES dbo.WorkOrders(WorkOrderID),
    MaterialName  NVARCHAR(150) NOT NULL,
    Quantity      INT           NOT NULL CONSTRAINT CK_WorkMaterials_Qty  CHECK (Quantity > 0),
    UnitCost      DECIMAL(10,2) NOT NULL CONSTRAINT CK_WorkMaterials_Cost CHECK (UnitCost >= 0),
    TotalCost     AS (CONVERT(DECIMAL(12,2), Quantity * UnitCost)) PERSISTED   -- calculated automatically
);
GO

/* ============================================================================
   5. INVOICING, EXPENSES & AUDIT LOGS
   ============================================================================ */

IF OBJECT_ID('dbo.ContractorInvoices') IS NULL
CREATE TABLE dbo.ContractorInvoices (
    InvoiceID           INT IDENTITY(1,1) CONSTRAINT PK_ContractorInvoices PRIMARY KEY,
    WorkOrderID         INT           NOT NULL CONSTRAINT UQ_ContractorInvoices_WorkOrderID UNIQUE
                                      CONSTRAINT FK_ContractorInvoices_WorkOrders REFERENCES dbo.WorkOrders(WorkOrderID),
    ContractorID        INT           NOT NULL CONSTRAINT FK_ContractorInvoices_Contractors REFERENCES dbo.Contractors(ContractorID),
    TotalLaborCost      DECIMAL(10,2) NOT NULL CONSTRAINT CK_ContractorInvoices_Labor    CHECK (TotalLaborCost >= 0),
    TotalMaterialCost   DECIMAL(10,2) NOT NULL CONSTRAINT CK_ContractorInvoices_Material CHECK (TotalMaterialCost >= 0),
    TotalInvoiceAmount  AS (TotalLaborCost + TotalMaterialCost) PERSISTED,   -- calculated automatically
    Status              VARCHAR(20)   NOT NULL CONSTRAINT DF_ContractorInvoices_Status DEFAULT 'Submitted'
                        CONSTRAINT CK_ContractorInvoices_Status CHECK (Status IN ('Submitted','Approved','Paid','Rejected')),
    InvoiceDate         DATE          NOT NULL CONSTRAINT DF_ContractorInvoices_Date DEFAULT CAST(SYSDATETIME() AS DATE)
);
GO

IF OBJECT_ID('dbo.Expenses') IS NULL
CREATE TABLE dbo.Expenses (
    ExpenseID    INT IDENTITY(1,1) CONSTRAINT PK_Expenses PRIMARY KEY,
    PropertyID   INT           NOT NULL CONSTRAINT FK_Expenses_Properties REFERENCES dbo.Properties(PropertyID),
    InvoiceID    INT           NULL     CONSTRAINT FK_Expenses_Invoices   REFERENCES dbo.ContractorInvoices(InvoiceID),
    ExpenseType  VARCHAR(20)   NOT NULL CONSTRAINT CK_Expenses_Type CHECK (ExpenseType IN ('Maintenance','Utility','Tax','Operational')),
    Amount       DECIMAL(10,2) NOT NULL CONSTRAINT CK_Expenses_Amount CHECK (Amount >= 0),
    ExpenseDate  DATE          NOT NULL,
    Notes        NVARCHAR(MAX) NULL
);
GO

IF OBJECT_ID('dbo.Notifications') IS NULL
CREATE TABLE dbo.Notifications (
    NotificationID    INT IDENTITY(1,1) CONSTRAINT PK_Notifications PRIMARY KEY,
    UserID            INT           NOT NULL CONSTRAINT FK_Notifications_Users REFERENCES dbo.Users(UserID),
    Title             NVARCHAR(150) NOT NULL,
    Message           NVARCHAR(MAX) NOT NULL,
    NotificationType  VARCHAR(20)   NOT NULL CONSTRAINT CK_Notifications_Type CHECK (NotificationType IN ('Rent','Maintenance','General')),  -- was "Type"
    IsRead            BIT           NOT NULL CONSTRAINT DF_Notifications_IsRead DEFAULT 0,
    CreatedAt         DATETIME2     NOT NULL CONSTRAINT DF_Notifications_CreatedAt DEFAULT SYSDATETIME()
);
GO

IF OBJECT_ID('dbo.AuditLogs') IS NULL
CREATE TABLE dbo.AuditLogs (
    AuditLogID       INT IDENTITY(1,1) CONSTRAINT PK_AuditLogs PRIMARY KEY,
    UserID           INT           NULL CONSTRAINT FK_AuditLogs_Users REFERENCES dbo.Users(UserID),
    ActionPerformed  VARCHAR(100)  NOT NULL,
    AffectedEntity   VARCHAR(100)  NOT NULL,   -- e.g. Leases, Payments
    EntityID         INT           NULL,
    OldValues        NVARCHAR(MAX) NULL,
    NewValues        NVARCHAR(MAX) NULL,
    PerformedAt      DATETIME2     NOT NULL CONSTRAINT DF_AuditLogs_PerformedAt DEFAULT SYSDATETIME()  -- was "Timestamp"
);
GO

/* ============================================================================
   INDEXES on frequently searched foreign keys
   ============================================================================ */

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Units_PropertyID')
    CREATE INDEX IX_Units_PropertyID ON dbo.Units(PropertyID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Leases_TenantID')
    CREATE INDEX IX_Leases_TenantID ON dbo.Leases(TenantID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TenantCharges_LeaseID')
    CREATE INDEX IX_TenantCharges_LeaseID ON dbo.TenantCharges(LeaseID, Status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Payments_LeaseID')
    CREATE INDEX IX_Payments_LeaseID ON dbo.Payments(LeaseID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RentChaseLogs_RentScheduleID')
    CREATE INDEX IX_RentChaseLogs_RentScheduleID ON dbo.RentChaseLogs(RentScheduleID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MaintenanceRequests_UnitID')
    CREATE INDEX IX_MaintenanceRequests_UnitID ON dbo.MaintenanceRequests(UnitID, Status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Notifications_User_IsRead')
    CREATE INDEX IX_Notifications_User_IsRead ON dbo.Notifications(UserID, IsRead);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_Entity')
    CREATE INDEX IX_AuditLogs_Entity ON dbo.AuditLogs(AffectedEntity, EntityID);
GO

PRINT 'Schema created successfully.';
GO