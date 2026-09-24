const BASE_URL = 'https://siteledger-bice.vercel.app/api/v1';

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

async function del(endpoint, token = null) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'DELETE',
        headers,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, data: json };
}

async function main() {
    // 1. Authenticate all 3 roles
    const adminLogin = await post('/auth/login', { email: 'admin@example.com', password: '123456' });
    const managerLogin = await post('/auth/login', { email: 'mirhasasn.bd1@gmail.com', password: '12345678' });
    const workerLogin = await post('/auth/login', { email: 'mehateh115@jobscai.com', password: '123456' });

    const adminToken = adminLogin.data?.data?.accessToken;
    const managerToken = managerLogin.data?.data?.accessToken;
    const workerToken = workerLogin.data?.data?.accessToken;

    const adminId = adminLogin.data?.data?.user?.id;
    const managerId = managerLogin.data?.data?.user?.id;
    const workerId = workerLogin.data?.data?.user?.id;

    console.log('=== ROLE SECURITY & IDOR AUDIT ===\n');

    // 1. Worker attempting Manager / Admin actions
    console.log('--- 1. Worker Elevation Tests ---');
    const workerCreateProject = await post('/projects', {
        projectName: 'Hacker Project',
        description: 'Should fail',
        address: 'Nowhere',
        budget: 100000,
        standardWorkHours: 8,
        managerId: managerId,
    }, workerToken);
    console.log('Worker creating project:', workerCreateProject.status, workerCreateProject.data?.message);

    const workerCreatePayment = await post('/payments', {
        workerId: workerId,
        projectId: '6ab0c13225977fe4da55ef58',
        amount: 999999,
        method: 'Cash',
    }, workerToken);
    console.log('Worker recording payment to self:', workerCreatePayment.status, workerCreatePayment.data?.message);

    const workerReviewWithdraw = await patch(`/workers/${workerId}/withdraws/6ab23bc2a44a5c1b4c34fe63/review`, {
        status: 'Accepted'
    }, workerToken);
    console.log('Worker approving own withdrawal:', workerReviewWithdraw.status, workerReviewWithdraw.data?.message);

    const workerReviewLeave = await patch('/leaves/6ab23e84a44a5c1b4c34fe66/review', {
        status: 'Accepted'
    }, workerToken);
    console.log('Worker approving leave:', workerReviewLeave.status, workerReviewLeave.data?.message);

    const workerAssignWorker = await post(`/workers/${workerId}/assign`, {
        projectId: '6ab0e6746d450f1e23064f45'
    }, workerToken);
    console.log('Worker assigning self to project:', workerAssignWorker.status, workerAssignWorker.data?.message);

    const workerUnassignWorker = await post(`/workers/${workerId}/unassign`, {}, workerToken);
    console.log('Worker unassigning self from project:', workerUnassignWorker.status, workerUnassignWorker.data?.message);

    const workerCreateMaterial = await post('/materials', {
        name: 'Gold Bars',
        category: 'Other',
        unit: 'Unit',
        unitCost: 50000,
    }, workerToken);
    console.log('Worker creating material:', workerCreateMaterial.status, workerCreateMaterial.data?.message);

    const workerCreateExpense = await post('/expenses', {
        projectId: '6ab0c13225977fe4da55ef58',
        title: 'Worker fake expense',
        category: 'Labor',
        amount: 10000
    }, workerToken);
    console.log('Worker creating project expense:', workerCreateExpense.status, workerCreateExpense.data?.message);

    const workerCreateDailyReport = await post('/daily-reports', {
        projectId: '6ab0c13225977fe4da55ef58',
        date: '2026-09-24',
        presentWorkers: 10,
        absentWorkers: 0,
    }, workerToken);
    console.log('Worker creating daily report:', workerCreateDailyReport.status, workerCreateDailyReport.data?.message);

    // 2. Site Manager Cross-Project Access (IDOR)
    console.log('\n--- 2. Site Manager Cross-Project Isolation Tests ---');
    const unmanagedProjectId = '6ab0e6746d450f1e23064f45'; // Project managed by other manager 6ab200a9f8c64e6a677c5c89

    const mgrGetUnmanagedProject = await get(`/projects/${unmanagedProjectId}`, managerToken);
    console.log('Manager fetching unmanaged project:', mgrGetUnmanagedProject.status, mgrGetUnmanagedProject.data?.message);

    const mgrUpdateUnmanagedProject = await patch(`/projects/${unmanagedProjectId}`, {
        description: 'Compromised description'
    }, managerToken);
    console.log('Manager updating unmanaged project:', mgrUpdateUnmanagedProject.status, mgrUpdateUnmanagedProject.data?.message);

    const mgrDeleteUnmanagedProject = await del(`/projects/${unmanagedProjectId}`, managerToken);
    console.log('Manager deleting unmanaged project:', mgrDeleteUnmanagedProject.status, mgrDeleteUnmanagedProject.data?.message);

    const mgrRecordPaymentUnmanaged = await post('/payments', {
        workerId: workerId,
        projectId: unmanagedProjectId,
        amount: 5000,
        method: 'Cash',
    }, managerToken);
    console.log('Manager recording payment on unmanaged project:', mgrRecordPaymentUnmanaged.status, mgrRecordPaymentUnmanaged.data?.message);

    const mgrMarkAttendanceUnmanaged = await post('/attendances', {
        workerId: workerId,
        projectId: unmanagedProjectId,
        date: '2026-09-24',
        status: 'Present'
    }, managerToken);
    console.log('Manager marking attendance on unmanaged project:', mgrMarkAttendanceUnmanaged.status, mgrMarkAttendanceUnmanaged.data?.message);

    const mgrDailyReportUnmanaged = await post('/daily-reports', {
        projectId: unmanagedProjectId,
        date: '2026-09-24',
        presentWorkers: 10,
        absentWorkers: 0
    }, managerToken);
    console.log('Manager creating daily report on unmanaged project:', mgrDailyReportUnmanaged.status, mgrDailyReportUnmanaged.data?.message);

    const mgrTasksUnmanaged = await get(`/tasks?projectId=${unmanagedProjectId}`, managerToken);
    console.log('Manager fetching tasks of unmanaged project:', mgrTasksUnmanaged.status, mgrTasksUnmanaged.data?.message);

    const mgrCreateTaskUnmanaged = await post('/tasks', {
        projectId: unmanagedProjectId,
        title: 'Rogue Task',
        priority: 'High'
    }, managerToken);
    console.log('Manager creating task on unmanaged project:', mgrCreateTaskUnmanaged.status, mgrCreateTaskUnmanaged.data?.message);

    const mgrRatesUnmanaged = await post(`/projects/${unmanagedProjectId}/rates`, {
        category: 'Plumber',
        dailyRate: 1500
    }, managerToken);
    console.log('Manager setting rate on unmanaged project:', mgrRatesUnmanaged.status, mgrRatesUnmanaged.data?.message);

    const mgrChatUnmanaged = await get(`/chat/project-rooms/${unmanagedProjectId}/messages`, managerToken);
    console.log('Manager reading unmanaged project group chat:', mgrChatUnmanaged.status, mgrChatUnmanaged.data?.message);

    const mgrSendChatUnmanaged = await post(`/chat/project-rooms/${unmanagedProjectId}/messages`, {
        content: 'I should not be here'
    }, managerToken);
    console.log('Manager posting to unmanaged project group chat:', mgrSendChatUnmanaged.status, mgrSendChatUnmanaged.data?.message);

    // 3. Admin Permissions
    console.log('\n--- 3. Admin Permission Scope Tests ---');
    const adminInvites = await get('/invites', adminToken);
    console.log('Admin accessing /invites:', adminInvites.status, adminInvites.data?.message);

    const adminDeletePayment = await del('/payments/non-existent-id', adminToken);
    console.log('Admin accessing delete payment:', adminDeletePayment.status, adminDeletePayment.data?.message);

    const managerDeletePayment = await del('/payments/6ab213e7a20964db62eacfa3', managerToken);
    console.log('Manager attempting to delete payment (Admin only):', managerDeletePayment.status, managerDeletePayment.data?.message);
}

main().catch(console.error);
