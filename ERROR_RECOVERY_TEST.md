# Error Recovery System - Test Plan

This document provides a comprehensive test plan for the order status management and error recovery system.

## Prerequisites

- Server running on `http://localhost:3001`
- Web frontend accessible at `http://localhost:5173` (or served from server)
- At least one order with a custom field in the database
- LightBurn installed at `C:\Program Files\LightBurn\LightBurn.exe`

---

## 1. Normal Flow: Status Transitions (Happy Path)

### Test: Pending → Processing → Printed

**Steps:**
1. Start the server: `pnpm --filter server dev`
2. Open the web UI in a browser
3. Find an order with status='pending' (should have a gray circle badge)
4. Click "Send to LightBurn" button
5. Observe the status changes:
   - Immediately changes to 'processing' (amber badge with pulsing animation)
   - Button becomes disabled showing "Processing..."
   - After 2-3 seconds, status changes to 'printed' (green checkmark)
   - Button changes to "Resend" with amber color

**Expected Results:**
- Status badge transitions smoothly
- LightBurn opens with the generated `.lbrn2` file
- File is created in `C:\Temp\LightBurnAuto\Order_[ORDER_ID].lbrn2`
- Success toast message appears
- Search input clears and refocuses
- Order row becomes dimmed (opacity-50)

**Verify in Logs:**
```bash
tail -f server/logs/app.log | grep -i "lightburn\|status"
```

Look for:
- "Order locked for processing"
- "LightBurn project generated successfully"
- "Order status updated to 'printed'"

**Verify in Database:**
```bash
sqlite3 server/data/app.db "SELECT orderId, status, processedAt, attemptCount FROM orders WHERE orderId = 'YOUR_ORDER_ID';"
```

Expected output:
```
YOUR_ORDER_ID|printed|2024-02-07 13:45:22|1
```

---

## 2. Simulate Failures

### 2.1 Test: LightBurn Launch Failure

**Setup:**
```powershell
# In Windows PowerShell (as Administrator)
cd "C:\Program Files\LightBurn"
ren LightBurn.exe LightBurn.exe.backup
```

**Steps:**
1. Find a pending order with custom field
2. Click "Send to LightBurn"
3. Observe the error

**Expected Results:**
- Status changes to 'error' (red warning badge)
- Error badge is clickable
- Button changes to "Retry" with red styling
- Error toast appears: "LIGHTBURN_NOT_FOUND: LightBurn.exe not found at expected path..."
- `attemptCount` increments to 1

**Click Error Badge:**
- Modal opens showing:
  - Order ID
  - Full error message in red box
  - "Failed after 1 attempt"
  - "Retry Order" button

**Verify in Database:**
```bash
sqlite3 server/data/app.db "SELECT orderId, status, errorMessage, attemptCount FROM orders WHERE orderId = 'YOUR_ORDER_ID';"
```

Expected:
```
YOUR_ORDER_ID|pending|LIGHTBURN_NOT_FOUND: ...|1
```

Note: Status should be 'pending' if attemptCount < 3, 'error' if attemptCount >= 3

**Verify Retry with Exponential Backoff:**
Check logs for retry attempts:
```
"Attempting to execute LightBurn command" attempt=1
"Retrying after 1000ms delay" attempt=1
"Attempting to execute LightBurn command" attempt=2
"Retrying after 2000ms delay" attempt=2
"Attempting to execute LightBurn command" attempt=3
```

**Cleanup:**
```powershell
# Restore LightBurn
ren LightBurn.exe.backup LightBurn.exe
```

---

### 2.2 Test: File Verification Failure

**Setup:**
```powershell
# In Windows PowerShell (as Administrator)
# Make output directory read-only
icacls "C:\Temp\LightBurnAuto" /deny Everyone:(OI)(CI)W
```

**Steps:**
1. Find a pending order
2. Click "Send to LightBurn"
3. Observe the error

**Expected Results:**
- Status changes to 'error'
- Error message: "LIGHTBURN_FILE_VERIFICATION_FAILED: Failed to verify generated file..."
- File generation succeeds but verification fails
- `attemptCount` increments

**Verify File Was Not Created:**
```powershell
dir "C:\Temp\LightBurnAuto\Order_*.lbrn2"
```

**Cleanup:**
```powershell
# Restore write permissions
icacls "C:\Temp\LightBurnAuto" /grant Everyone:(OI)(CI)F
```

---

### 2.3 Test: Image Copy Failure

**Setup:**
```bash
# In WSL terminal
cd /home/crlyflacko/repos/Victoria/laser-app/server
mv assets assets.backup
```

**Steps:**
1. Find a pending order that has an image asset trigger in customField
   - e.g., custom field contains "cat" and you have an asset rule for "cat" → "cat.png"
2. Click "Send to LightBurn"
3. Observe the error

**Expected Results:**
- Error about missing image file
- Status changes to 'error'
- Error message includes "Failed to copy image"
- No orphaned image files in temp directory

**Verify No Orphaned Files:**
```bash
ls -la /mnt/c/Temp/LightBurnAuto/
```

Should NOT contain the copied image (cleanup successful)

**Verify in Logs:**
```bash
grep -i "cleanup" server/logs/app.log | tail -10
```

Look for:
- "Generation failed - cleaning up temporary files"
- "Successfully deleted temporary file"
- "Temporary file cleanup completed"

**Cleanup:**
```bash
mv assets.backup assets
```

---

### 2.4 Test: Template Not Found Failure

**Steps:**
1. Create an order with a SKU that has no matching template rule
2. Or temporarily delete the template file referenced by a rule
3. Click "Send to LightBurn"

**Expected Results:**
- Status changes to 'error'
- Error message: "Configuration Required: No template found for SKU 'XXX'. Please add a rule in Settings."
- HTTP 400 response
- attemptCount increments

**Verify Smart Error Type:**
- Error type is recognized as 'NO_TEMPLATE_MATCH'
- User-friendly message shown
- Suggests adding a rule in Settings

---

## 3. Retry Logic Tests

### 3.1 Test: Automatic Retry Eligibility (attemptCount < 3)

**Setup:**
Create a failure scenario (e.g., rename LightBurn.exe)

**Steps:**
1. Click "Send to LightBurn" on a pending order (attempt 1)
   - Verify status returns to 'pending'
   - Verify attemptCount = 1
2. Click "Retry" button (attempt 2)
   - Verify status returns to 'pending'
   - Verify attemptCount = 2
3. Click "Retry" button (attempt 3)
   - Verify status stays as 'error' (max attempts reached)
   - Verify attemptCount = 3

**Verify in Database After Each Attempt:**
```bash
sqlite3 server/data/app.db "SELECT orderId, status, attemptCount FROM orders WHERE orderId = 'YOUR_ORDER_ID';"
```

Expected progression:
```
Attempt 1: YOUR_ORDER_ID|pending|1
Attempt 2: YOUR_ORDER_ID|pending|2
Attempt 3: YOUR_ORDER_ID|error|3
```

**Verify in Logs:**
```bash
grep "attempt" server/logs/app.log | grep -i "YOUR_ORDER_ID"
```

Look for:
- "Setting status back to 'pending' for automatic retry"
- "Maximum attempts reached, setting status to 'error'"

---

### 3.2 Test: Manual Retry Endpoint

**Test with curl:**

```bash
# Get current order status
curl -s http://localhost:3001/orders | jq '.items[] | select(.orderId=="YOUR_ORDER_ID") | {orderId, status, attemptCount, errorMessage}'

# Retry a failed order
curl -X POST http://localhost:3001/orders/YOUR_ORDER_ID/retry \
  -H "Content-Type: application/json" | jq

# Expected Response (Success):
{
  "success": true,
  "message": "Order reset successfully and ready for retry",
  "order": {
    "id": 123,
    "orderId": "YOUR_ORDER_ID",
    "status": "pending",
    "errorMessage": null,
    "attemptCount": 0,
    ...
  },
  "previousStatus": "error",
  "previousAttemptCount": 3
}

# Verify order was reset
curl -s http://localhost:3001/orders | jq '.items[] | select(.orderId=="YOUR_ORDER_ID") | {orderId, status, attemptCount}'

# Expected:
{
  "orderId": "YOUR_ORDER_ID",
  "status": "pending",
  "attemptCount": 0
}
```

**Test Error Cases:**

```bash
# Try to retry non-existent order (404)
curl -X POST http://localhost:3001/orders/FAKE_ORDER_ID/retry | jq

# Expected:
{
  "error": "Order not found"
}

# Try to retry order that's currently processing (400)
# First, make sure an order is in processing state, then:
curl -X POST http://localhost:3001/orders/PROCESSING_ORDER_ID/retry | jq

# Expected:
{
  "error": "Cannot retry order that is currently being processed. Please wait for the current process to complete.",
  "status": "processing"
}

# Try to retry a pending order (400)
curl -X POST http://localhost:3001/orders/PENDING_ORDER_ID/retry | jq

# Expected:
{
  "error": "Order cannot be retried from 'pending' status. Only 'error' or 'printed' orders can be retried.",
  "status": "pending"
}
```

---

### 3.3 Test: UI Retry Flow

**From Error Badge:**
1. Click red "Failed" badge on an error order
2. Error modal opens with details
3. Click "Retry Order" button
4. Button shows "Retrying..."
5. Modal closes
6. Status changes to 'pending'
7. Gray badge appears
8. Success toast: "Order YOUR_ORDER_ID reset successfully. Ready to retry."

**From Retry Button:**
1. Click red "Retry" button in action column
2. Button shows "Retrying..."
3. Button is disabled during operation
4. Status changes to 'pending'
5. Button changes to "Send to LightBurn"

**Optimistic Updates:**
- UI updates immediately (before server responds)
- If retry fails, UI reverts by refetching data
- Loading states prevent double-clicks

---

## 4. Cleanup Verification Tests

### 4.1 Test: Temp Files Cleaned on Failure

**Setup:**
1. Create an order with an image asset (e.g., customField contains "cat")
2. Set up a failure scenario (e.g., make output directory read-only)

**Steps:**
1. Before processing, check temp directory:
   ```bash
   ls -la /mnt/c/Temp/LightBurnAuto/
   ```
2. Click "Send to LightBurn"
3. Wait for error
4. Check temp directory again:
   ```bash
   ls -la /mnt/c/Temp/LightBurnAuto/
   ```

**Expected Results:**
- Copied image files are NOT present (cleaned up)
- Only successfully completed `.lbrn2` files remain
- Logs show cleanup messages

**Verify in Logs:**
```bash
grep -A5 "cleaning up temporary files" server/logs/app.log | tail -20
```

Expected log entries:
```
"Generation failed - cleaning up temporary files" copiedFileCount=1
"Starting cleanup of temporary files" fileCount=1
"Successfully deleted temporary file" filePath="/mnt/c/Temp/LightBurnAuto/cat.png"
"Temporary file cleanup completed" fileCount=1
```

---

### 4.2 Test: Temp Files NOT Cleaned on Success

**Steps:**
1. Process an order successfully (with image asset)
2. Check temp directory:
   ```bash
   ls -la /mnt/c/Temp/LightBurnAuto/
   ```

**Expected Results:**
- `.lbrn2` file is present
- Copied image file is present
- Both files remain (LightBurn needs them)

**Verify in Logs:**
```bash
grep "keeping temp files" server/logs/app.log | tail -5
```

Expected:
```
"Generation succeeded - keeping temp files for LightBurn to use" copiedFileCount=1
```

---

## 5. Concurrent Processing Protection

### 5.1 Test: Cannot Process Same Order Twice

**Steps:**
1. Open web UI in two different browser tabs/windows
2. In tab 1, click "Send to LightBurn" on an order
3. Quickly switch to tab 2 and try to click the same order

**Expected Results:**
- Tab 1: Order changes to 'processing'
- Tab 2: If fast enough, sees 'processing' status and button is disabled
- If tab 2 sends request after tab 1 sets 'processing', gets error:
  - HTTP 409 Conflict
  - "Order is already being processed by another operator"

**Test with curl:**
```bash
# Terminal 1: Start processing
curl -X POST http://localhost:3001/orders/YOUR_ORDER_ID/lightburn &

# Terminal 2: Try to process same order (quickly!)
curl -X POST http://localhost:3001/orders/YOUR_ORDER_ID/lightburn | jq

# Expected if concurrent:
{
  "error": "Order is already being processed by another operator. Please wait or refresh to see the latest status.",
  "status": "processing",
  "attemptCount": 1
}
```

---

## 6. Edge Cases

### 6.1 Test: Reprocess Already Printed Order

**Steps:**
1. Find an order with status='printed'
2. Click "Resend" button (amber color)

**Expected Results:**
- Order processes successfully again
- Success response includes warning: "This order was already marked as printed. Reprocessed successfully."
- attemptCount increments
- processedAt updates to new timestamp
- Status remains 'printed'

---

### 6.2 Test: Network Failure Handling

**Setup:**
```bash
# Stop the server
pkill -f "node.*server"
```

**Steps:**
1. Try to click "Send to LightBurn" in UI

**Expected Results:**
- Error toast: "Network error: Failed to send to LightBurn"
- Status changes to 'error' (optimistic update)
- After server restart, status shows actual server state

**Cleanup:**
```bash
# Restart server
pnpm --filter server dev
```

---

## 7. Full Integration Test Scenario

**Complete workflow testing all features:**

1. **Fresh Order Processing:**
   - Sync orders to get fresh data
   - Pick pending order with custom field
   - Send to LightBurn → Success
   - Verify printed status and timestamp

2. **Simulate Failure:**
   - Rename LightBurn.exe
   - Try to process another order
   - Verify error status and attempt count = 1
   - Check logs for retry attempts and error details

3. **Manual Retry:**
   - Click error badge to open modal
   - Review error details
   - Click "Retry Order"
   - Verify status resets to pending with attemptCount = 0

4. **Fix Issue and Retry:**
   - Restore LightBurn.exe
   - Click "Send to LightBurn"
   - Verify successful processing

5. **Cleanup Verification:**
   - Check temp directory for files
   - Review logs for cleanup messages
   - Verify database state

---

## 8. Database Queries for Debugging

**Get all orders with their status:**
```bash
sqlite3 server/data/app.db "SELECT orderId, status, attemptCount, errorMessage, processedAt FROM orders ORDER BY id DESC LIMIT 10;"
```

**Find all error orders:**
```bash
sqlite3 server/data/app.db "SELECT orderId, status, attemptCount, errorMessage FROM orders WHERE status = 'error';"
```

**Find orders ready for retry:**
```bash
sqlite3 server/data/app.db "SELECT orderId, attemptCount, errorMessage FROM orders WHERE status = 'pending' AND attemptCount > 0;"
```

**Check processing orders (should be temporary):**
```bash
sqlite3 server/data/app.db "SELECT orderId, status, attemptCount, updatedAt FROM orders WHERE status = 'processing';"
```

**View order history:**
```bash
sqlite3 server/data/app.db "SELECT orderId, status, attemptCount, processedAt, errorMessage FROM orders WHERE orderId = 'YOUR_ORDER_ID';"
```

---

## 9. Log Analysis Commands

**Watch live logs:**
```bash
tail -f server/logs/app.log | jq
```

**Filter by order ID:**
```bash
grep "YOUR_ORDER_ID" server/logs/app.log | jq
```

**View all errors:**
```bash
grep '"level":50' server/logs/app.log | jq
```

**View retry attempts:**
```bash
grep -i "retry\|attempt" server/logs/app.log | jq
```

**View status transitions:**
```bash
grep -i "status.*updated\|Order locked" server/logs/app.log | jq
```

---

## 10. Performance Testing

**Rapid Sequential Processing:**
```bash
# Process 5 orders in quick succession
for i in {1..5}; do
  curl -X POST http://localhost:3001/orders/ORDER_${i}/lightburn &
done
wait

# Check results
curl -s http://localhost:3001/orders | jq '.items[] | select(.status=="error" or .status=="processing") | {orderId, status, attemptCount}'
```

---

## Success Criteria

All tests pass when:
- ✅ Status transitions work correctly (pending → processing → printed)
- ✅ Errors are caught and status set to 'error' with details
- ✅ attemptCount increments on each failure
- ✅ Orders with attemptCount < 3 return to 'pending'
- ✅ Orders with attemptCount >= 3 stay in 'error'
- ✅ Manual retry resets order to pending with attemptCount = 0
- ✅ Temp files cleaned up on failure
- ✅ Temp files kept on success
- ✅ Concurrent processing blocked with 409 error
- ✅ UI shows correct badges and buttons for each status
- ✅ Error modal displays complete error information
- ✅ Retry buttons work from both modal and table
- ✅ Logs contain detailed information for debugging
- ✅ Database state matches UI state

---

## Troubleshooting

**Order stuck in 'processing':**
```bash
# Manually reset to pending
sqlite3 server/data/app.db "UPDATE orders SET status='pending' WHERE orderId='STUCK_ORDER_ID';"
```

**Clear all errors for testing:**
```bash
sqlite3 server/data/app.db "UPDATE orders SET status='pending', errorMessage=NULL, attemptCount=0 WHERE status='error';"
```

**Reset temp directory:**
```bash
rm -rf /mnt/c/Temp/LightBurnAuto/*
```

**View full error stack traces:**
```bash
grep -A20 '"err":' server/logs/app.log | jq
```
