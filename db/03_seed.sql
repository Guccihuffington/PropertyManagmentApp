/* ============================================================================
   03_seed.sql  -  PropertyManagementDB
   Sample/test data only. All names, emails and hashes are fake.
   Safe to re-run: skips if Roles already has data.
   Run AFTER 02_schema.sql.
   ============================================================================ */

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

USE PropertyManagementDB;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Roles)
BEGIN
    -- Roles (IDs: 1 Tenant, 2 PropertyManager, 3 Contractor, 4 Admin)
    INSERT INTO dbo.Roles (RoleName) VALUES
    ('Tenant'), ('PropertyManager'), ('Contractor'), ('Admin');

    -- Users (IDs: 1 manager, 2 tenant, 3 contractor, 4 admin)
    INSERT INTO dbo.Users (RoleID, Email, PasswordHash, FirstName, LastName, PhoneNumber) VALUES
    (2, 'manager@example.com',    'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Morgan', 'Reyes',  '812-555-0100'),
    (1, 'alice.tenant@example.com','SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Alice',  'Johnson','812-555-0101'),
    (3, 'bob.plumbing@example.com','SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Bob',    'Carter', '812-555-0102'),
    (4, 'admin@example.com',      'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Ada',    'Admin',  NULL),
    (1, 'tenant02@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'James',    'Smith',    '812-555-0102'),
    (1, 'tenant03@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Emma',     'Brown',    '812-555-0103'),
    (1, 'tenant04@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Liam',     'Davis',    '812-555-0104'),
    (1, 'tenant05@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Olivia',   'Wilson',   '812-555-0105'),
    (1, 'tenant06@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Noah',     'Miller',   '812-555-0106'),
    (1, 'tenant07@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Ava',      'Taylor',   '812-555-0107'),
    (1, 'tenant08@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Ethan',    'Anderson', '812-555-0108'),
    (1, 'tenant09@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Sophia',   'Thomas',   '812-555-0109'),
    (1, 'tenant10@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Lucas',    'Jackson',  '812-555-0110'),
    (1, 'tenant11@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Isabella', 'White',    '812-555-0111'),
    (1, 'tenant12@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Mason',    'Harris',   '812-555-0112'),
    (1, 'tenant13@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Mia',      'Martin',   '812-555-0113'),
    (1, 'tenant14@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Logan',    'Thompson', '812-555-0114'),
    (1, 'tenant15@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Amelia',   'Garcia',   '812-555-0115'),
    (1, 'tenant16@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Elijah',   'Martinez', '812-555-0116'),
    (1, 'tenant17@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Charlotte','Robinson', '812-555-0117'),
    (1, 'tenant18@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'James',    'Clark',    '812-555-0118'),
    (1, 'tenant19@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Evelyn',   'Lewis',    '812-555-0119'),
    (1, 'tenant20@example.com', 'SEED_PLACEHOLDER_NOT_A_REAL_HASH', 'Benjamin', 'Lee',      '812-555-0120');

    INSERT INTO dbo.UserDevices (UserID, DeviceToken, Platform) VALUES
    (2, 'fake-device-token-abc123', 'iOS');

    -- Property, units
    INSERT INTO dbo.Properties (ManagerUserID, PropertyName, StreetAddress, City, State, ZipCode) VALUES
    (1, 'Maple Court', '120 Maple St', 'Evansville', 'IN', '47708');

    INSERT INTO dbo.Units (PropertyID, UnitNumber, Status) VALUES
    (1, '101', 'Occupied'),
    (1, '102', 'Vacant');

    -- Tenant and lease
    INSERT INTO dbo.Tenants (UserID, EmergencyContact)
    SELECT
        UserID,
        CONCAT('Emergency Contact - ', FirstName, ' Family')
    FROM dbo.Users
    WHERE Email LIKE 'tenant[0-9][0-9]@example.com';

    INSERT INTO dbo.Leases (UnitID, TenantID, StartDate, EndDate, RentAmount, SecurityDeposit, DueDayOfMonth, LateFeeGraceDays, LateFeeAmount, IsActive) VALUES
    (1, 1, '2026-01-01', '2026-12-31', 850.00, 850.00, 1, 3, 50.00, 1);

    -- Rent schedule (IDs: 1 Sep paid, 2 Oct overdue, 3 Nov pending)
    INSERT INTO dbo.RentSchedules (LeaseID, DueDate, BaseRentAmount, Status) VALUES
    (1, '2026-09-01', 850.00, 'Paid'),
    (1, '2026-10-01', 850.00, 'Overdue'),
    (1, '2026-11-01', 850.00, 'Pending');

    -- Charges (IDs: 1 Sep rent, 2 Oct rent, 3 Oct late fee)
    INSERT INTO dbo.TenantCharges (LeaseID, RentScheduleID, ChargeType, ChargeAmount, IssueDate, DueDate, Status) VALUES
    (1, 1, 'Rent',    850.00, '2026-08-25', '2026-09-01', 'Paid'),
    (1, 2, 'Rent',    850.00, '2026-09-25', '2026-10-01', 'Unpaid'),
    (1, 2, 'LateFee',  50.00, '2026-10-05', '2026-10-15', 'Unpaid');

    -- Payment for September, allocated to the September rent charge
    INSERT INTO dbo.Payments (LeaseID, TenantID, AmountPaid, PaymentDate, PaymentMethod, TransactionReference, Status) VALUES
    (1, 1, 850.00, '2026-09-01T09:30:00', 'ACH', 'TXN-0001', 'Success');

    INSERT INTO dbo.PaymentAllocations (PaymentID, ChargeID, AllocatedAmount) VALUES
    (1, 1, 850.00);

    -- Rent chase reminders for the overdue October rent
    INSERT INTO dbo.RentChaseLogs (RentScheduleID, CommunicationType, StepLevel, SentTimestamp, Status) VALUES
    (2, 'Push',  1, '2026-10-01T08:00:00', 'Delivered'),
    (2, 'SMS',   3, '2026-10-04T08:00:00', 'Delivered'),
    (2, 'Email', 5, '2026-10-06T08:00:00', 'Sent');

    -- Maintenance workflow: request -> project -> bid
    INSERT INTO dbo.MaintenanceRequests (TenantID, UnitID, Title, Description, Category, Priority, Status) VALUES
    (1, 1, 'Leaking kitchen faucet', 'Faucet drips constantly and there is water under the sink.', 'Plumbing', 'High', 'Bidding');

    INSERT INTO dbo.WorkPhotos (WorkOrderID, RequestID, PhotoType, StorageURL) VALUES
    (NULL, 1, 'TenantIssue', 'https://example.blob.core.windows.net/photos/faucet-leak.jpg');

    INSERT INTO dbo.Contractors (UserID, CompanyName, Specialty, LicenseNumber) VALUES
    (3, 'Carter Plumbing LLC', 'Plumbing', 'IN-PL-000000');

    INSERT INTO dbo.MaintenanceProjects (RequestID, ApprovedByManagerID, BiddingDeadline, Status) VALUES
    (1, 1, '2026-10-25T17:00:00', 'OpenForBids');

    INSERT INTO dbo.ContractorBids (ProjectID, ContractorID, EstimatedCost, EstimatedHours, Notes) VALUES
    (1, 1, 180.00, 3.0, 'Replace faucet cartridge and supply lines.');

    -- Notification and audit example
    INSERT INTO dbo.Notifications (UserID, Title, Message, NotificationType) VALUES
    (2, 'Rent overdue', 'Your October rent is past due. A late fee has been added.', 'Rent');

    INSERT INTO dbo.AuditLogs (UserID, ActionPerformed, AffectedEntity, EntityID, OldValues, NewValues) VALUES
    (1, 'UPDATE', 'RentSchedules', 2, '{"Status":"Pending"}', '{"Status":"Overdue"}');
END
GO

PRINT 'Seed data loaded.';
GO