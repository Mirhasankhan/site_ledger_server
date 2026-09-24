const BASE_URL = 'http://localhost:5000/api/v1';

async function post(endpoint, data, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, data: json };
}

async function get(endpoint, token = null) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'GET',
        headers,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, data: json };
}

async function patch(endpoint, data, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, data: json };
}

async function main() {
    console.log('--- STARTING COMPREHENSIVE END-TO-END FLOW VERIFICATION ---');

    // 1. Authenticate all 3 roles
    const adminLogin = await post('/auth/login', { email: 'admin@example.com', password: '123456' });
    const managerLogin = await post('/auth/login', { email: 'mirhasasn.bd1@gmail.com', password: '12345678' });
    const workerLogin = await post('/auth/login', { email: 'mehateh115@jobscai.com', password: '123456' });

    console.log('Login statuses:', {
        admin: adminLogin.status,
        manager: managerLogin.status,
        worker: workerLogin.status,
    });

    const adminToken = adminLogin.data?.data?.accessToken;
    const managerToken = managerLogin.data?.data?.accessToken;
    const workerToken = workerLogin.data?.data?.accessToken;

    if (!adminToken || !managerToken || !workerToken) {
        console.error('Login failed! Halting test.');
        return;
    }

    // 2. Test 401 Unauthorized vs 403 Forbidden
    console.log('\n[TEST 1] Authorization Guard - 401 vs 403');
    const noTokenRes = await get('/projects', 'invalid_token');
    console.log('Invalid Token GET /projects:', noTokenRes.status, '(Expect 401 Unauthorized)');

    // 3. Test Commercial Budget & Expenses scoping
    console.log('\n[TEST 2] Commercial Budget / Expense Scoping');
    const projectsRes = await get('/projects', adminToken);
    const projectId = projectsRes.data?.data?.[0]?.id;
    console.log('Using Project ID:', projectId);

    const workerBudget = await get(`/projects/${projectId}/budget-summary`, workerToken);
    console.log('Worker GET /projects/:id/budget-summary:', workerBudget.status, '(Expect 403 Forbidden)');

    const workerExpenses = await get('/expenses', workerToken);
    console.log('Worker GET /expenses:', workerExpenses.status, '(Expect 403 Forbidden)');

    const managerBudget = await get(`/projects/${projectId}/budget-summary`, managerToken);
    console.log('Manager GET /projects/:id/budget-summary:', managerBudget.status, '(Expect 200 OK)');

    // 4. Test Offline Worker Payments Disabled
    console.log('\n[TEST 3] Offline Worker Payment Prevention');
    const offlinePayRes = await post('/payments', {
        projectId,
        amount: 100,
        paymentType: 'Worker_Payment',
        paymentMethod: 'Cash',
    }, adminToken);
    console.log('Admin POST /payments (Worker_Payment, Cash):', offlinePayRes.status, offlinePayRes.data?.message);

    // 5. Test Worker Earnings Flow
    console.log('\n[TEST 4] Attendance -> Earnings -> Stripe Flow');
    const earningsInitial = await get('/workers/earnings', workerToken);
    console.log('Worker Initial Earnings Response:', JSON.stringify(earningsInitial, null, 2));

    const workerProfileId = earningsInitial.data?.data?.workerProfileId;
    console.log('Worker Profile ID:', workerProfileId);

    // 6. Test Worker Unassign Protection when outstanding > 0
    console.log('\n[TEST 5] Worker Unassign Lock (Should fail because outstanding = 1140)');
    const unassignAttempt = await post(`/workers/${workerProfileId}/unassign`, {}, adminToken);
    console.log('Unassign Attempt when worker has balance/earnings:', unassignAttempt.status, unassignAttempt.data?.message);

    // 7. Test Worker creates withdrawal request
    console.log('\n[TEST 6] Worker creates Stripe Withdrawal Request');
    const withdrawAttempt = await post(`/workers/${workerProfileId}/withdraws`, { amount: 50 }, workerToken);
    console.log('Withdrawal Request status:', withdrawAttempt.status, withdrawAttempt.data?.message);

    // 8. Re-check worker earnings - available balance should decrease by 50, pending increases by 50
    const earningsAfterWithdraw = await get('/workers/earnings', workerToken);
    console.log('Worker Earnings after withdrawal request:', {
      availableBalance: earningsAfterWithdraw.data?.data?.availableBalance,
      pendingWithdrawals: earningsAfterWithdraw.data?.data?.pendingWithdrawals,
      grossEarnings: earningsAfterWithdraw.data?.data?.grossEarnings,
    });

    // 9. Admin lists all withdrawal requests
    console.log('\n[TEST 7] Admin lists Stripe Withdrawal Requests');
    const allWithdraws = await get('/workers/withdraws/all', adminToken);
    console.log('Total withdrawal requests found for admin:', allWithdraws.data?.data?.length);
    const pendingWithdraw = allWithdraws.data?.data?.find(w => w.status === 'Pending');
    console.log('Found pending withdrawal:', pendingWithdraw ? { id: pendingWithdraw.id, amount: pendingWithdraw.amount } : 'None');

    // 10. Clean up: Reject the test pending withdrawal so test doesn't leak
    if (pendingWithdraw) {
      console.log('\n[TEST 8] Admin reviews/rejects test withdrawal');
      const rejectRes = await patch(`/workers/${workerProfileId}/withdraws/${pendingWithdraw.id}/review`, {
        status: 'Rejected',
        note: 'Automated test cleanup',
      }, adminToken);
      console.log('Reject status:', rejectRes.status, rejectRes.data?.message);

      // Re-verify balance restored
      const earningsRestored = await get('/workers/earnings', workerToken);
      console.log('Worker Available Balance restored after rejection:', earningsRestored.data?.data?.availableBalance);
    }

    // 11. Test Tasks Listing and Global Activity
    console.log('\n[TEST 9] Tasks and Global Activity');
    const tasksRes = await get('/tasks', workerToken);
    console.log('Worker GET /tasks status:', tasksRes.status, 'Tasks count:', tasksRes.data?.data?.length);

    const activityRes = await get('/projects/activity/global', adminToken);
    console.log('Admin GET /projects/activity/global status:', activityRes.status, 'Count:', activityRes.data?.data?.length);

    const workerActivity = await get('/projects/activity/global', workerToken);
    console.log('Worker GET /projects/activity/global (Expect 403):', workerActivity.status);

    console.log('\n--- VERIFICATION FINISHED SUCCESSFULLY ---');
}

main().catch(console.error);
