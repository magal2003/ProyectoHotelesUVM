/**
 * Grand Luxe Hotel - Frontend conectado al backend Express/MySQL.
 */

const api = {
    baseUrl: 'http://localhost:3000/api',

    async request(path, options = {}) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            headers: { 'Content-Type': 'application/json' },
            ...options
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(data?.message || 'No se pudo completar la solicitud.');
        }

        return data;
    },

    get(path) {
        return this.request(path);
    },

    post(path, body) {
        return this.request(path, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    patch(path, body) {
        return this.request(path, {
            method: 'PATCH',
            body: JSON.stringify(body)
        });
    }
};

const app = {
    currentUser: null,
    companies: [],
    checkoutItems: [],
    checkoutSearch: '',
    activityLog: [],
    roomTypes: [],
    availableRooms: [],

    menus: {
        recepcion: [
            { id: 'panel-dashboard', icon: 'fa-solid fa-chart-pie', text: 'Dashboard' },
            { id: 'panel-nueva-reserva', icon: 'fa-solid fa-calendar-plus', text: 'Nueva Reserva' },
            { id: 'panel-checkout', icon: 'fa-solid fa-file-invoice', text: 'Check-out / Facturas' }
        ],
        gerente: [
            { id: 'panel-empresas', icon: 'fa-solid fa-building', text: 'Gestion de Empresas' },
            { id: 'panel-checkout', icon: 'fa-solid fa-file-invoice-dollar', text: 'Facturacion Mensual' }
        ],
        admin: [
            { id: 'panel-admin', icon: 'fa-solid fa-screwdriver-wrench', text: 'Mantenimiento del Sistema' },
            { id: 'panel-dashboard', icon: 'fa-solid fa-chart-pie', text: 'Vista Global' }
        ]
    },

    init() {
        this.activityLog = this.loadActivityLog();
        this.bindEvents();
        this.updateDateDisplay();
        document.getElementById('login-view').classList.add('active-view');
        document.getElementById('app-view').classList.remove('active-view');
    },

    bindEvents() {
        document.getElementById('login-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.login();
        });

        document.getElementById('logout-btn')?.addEventListener('click', () => this.logout());
        document.querySelector('.top-header .btn-icon')?.addEventListener('click', () => this.showNotifications());
        document.getElementById('create-account-btn')?.addEventListener('click', () => this.openCreateAccountModal());

        document.getElementById('form-reserva')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.createReservation(e.currentTarget);
        });

        this.ensureReservationRoomFields();
        ['tipo-habitacion', 'fecha-entrada', 'fecha-salida', 'req-no-fumador'].forEach((id) => {
            document.getElementById(id)?.addEventListener('change', () => this.loadAvailableRooms());
        });

        const checkoutButton = document.querySelector('#panel-checkout .search-bar button');
        const checkoutInput = document.querySelector('#panel-checkout .search-input');
        checkoutButton?.addEventListener('click', () => {
            this.checkoutSearch = checkoutInput?.value.trim().toLowerCase() || '';
            this.renderCheckout();
        });
        checkoutInput?.addEventListener('input', (e) => {
            this.checkoutSearch = e.target.value.trim().toLowerCase();
            this.renderCheckout();
        });

        document.querySelector('#panel-empresas .btn-primary.btn-sm')?.addEventListener('click', () => {
            this.createCompany();
        });

        const adminButtons = document.querySelectorAll('#panel-admin .btn-outline');
        adminButtons[0]?.addEventListener('click', () => this.showRoomsAdmin());
        adminButtons[1]?.addEventListener('click', () => this.showUsersAdmin());

        document.getElementById('modal-root')?.addEventListener('click', (e) => {
            if (e.target.id === 'modal-root') {
                this.closeModal();
            }
        });
    },

    async login() {
        const email = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        try {
            const { user } = await api.post('/auth/login', { email, password });
            this.currentUser = user;

            document.getElementById('current-user-name').innerText = user.name;
            document.getElementById('current-role-name').innerText = this.formatRole(user.role);

            this.renderNavigation();
            document.getElementById('login-view').classList.remove('active-view');
            document.getElementById('app-view').classList.add('active-view');
        } catch (error) {
            this.notify(error.message, 'error');
        }
    },

    openCreateAccountModal() {
        this.openModal({
            title: 'Crear cuenta',
            body: `
                <form id="account-modal-form" class="modal-form">
                    <div class="modal-grid">
                        <div>
                            <label>Nombre completo</label>
                            <input name="nombre" type="text" required>
                        </div>
                        <div>
                            <label>Rol</label>
                            <select name="role" required>
                                <option value="recepcion">Recepcion</option>
                                <option value="gerente">Gerente</option>
                                <option value="admin">Administrador</option>
                            </select>
                        </div>
                        <div>
                            <label>Correo</label>
                            <input name="email" type="email" required>
                        </div>
                        <div>
                            <label>Contrasena</label>
                            <input name="password" type="password" minlength="4" required>
                        </div>
                    </div>
                </form>
            `,
            actions: [
                { text: 'Cancelar', className: 'btn-outline', onClick: () => this.closeModal() },
                {
                    text: 'Crear cuenta',
                    className: 'btn-primary',
                    onClick: async () => {
                        const form = document.getElementById('account-modal-form');
                        if (!form.reportValidity()) return;

                        const payload = Object.fromEntries(new FormData(form).entries());
                        const { user } = await api.post('/auth/register', payload);

                        this.addActivity('Usuarios', `Se creo la cuenta de ${user.name} con rol ${this.formatRole(user.role)}.`, 'fa-user-plus');
                        this.notify('Cuenta creada. Ya puedes iniciar sesion.', 'success');
                        document.getElementById('username').value = payload.email;
                        document.getElementById('password').value = '';
                        this.closeModal();
                    }
                }
            ]
        });
    },

    logout() {
        this.currentUser = null;
        document.getElementById('login-form').reset();
        document.getElementById('app-view').classList.remove('active-view');
        document.getElementById('login-view').classList.add('active-view');
    },

    renderNavigation() {
        const navList = document.getElementById('nav-links');
        navList.innerHTML = '';

        const menuItems = this.menus[this.currentUser.role] || [];

        menuItems.forEach((item, index) => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = '#';
            a.innerHTML = `<i class="${item.icon}"></i> ${item.text}`;

            if (index === 0) {
                a.classList.add('active');
                this.showPanel(item.id, item.text);
            }

            a.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.nav-links a').forEach(link => link.classList.remove('active'));
                a.classList.add('active');
                this.showPanel(item.id, item.text);
            });

            li.appendChild(a);
            navList.appendChild(li);
        });
    },

    async showPanel(panelId, title = null) {
        document.querySelectorAll('.panel').forEach(panel => panel.classList.remove('active-panel'));

        const targetPanel = document.getElementById(panelId);
        if (targetPanel) {
            targetPanel.classList.add('active-panel');
        }

        if (title) {
            document.getElementById('page-title').innerText = title;
        }

        if (panelId === 'panel-dashboard') await this.loadDashboard();
        if (panelId === 'panel-empresas') await this.loadCompanies();
        if (panelId === 'panel-nueva-reserva') {
            await this.loadCompanies();
            await this.loadRoomTypes();
        }
        if (panelId === 'panel-checkout') await this.loadCheckout();
        if (panelId === 'panel-admin') await this.loadAdminSummary();
    },

    async loadDashboard() {
        try {
            const dashboard = await api.get('/dashboard');
            document.getElementById('stat-rooms-free').innerText = dashboard.stats.habitacionesLibres;
            document.getElementById('stat-arrivals-today').innerText = dashboard.stats.llegadasHoy;
            document.getElementById('stat-occupancy').innerText = `${dashboard.stats.ocupacion}%`;
            this.renderArrivals(dashboard.nextArrivals);
        } catch (error) {
            this.renderTableMessage(this.getArrivalsBody(), error.message, 6);
        }
    },

    renderArrivals(arrivals) {
        const tbody = this.getArrivalsBody();
        if (!arrivals?.length) {
            this.renderTableMessage(tbody, 'No hay llegadas proximas.', 6);
            return;
        }

        tbody.innerHTML = arrivals.map((reservation) => {
            const company = reservation.empresa ? ` (${reservation.empresa})` : '';
            const room = reservation.habitacion
                ? `${reservation.habitacion} (${reservation.tipo_habitacion})`
                : 'Sin asignar';

            return `
                <tr>
                    <td>${reservation.cliente}${company}</td>
                    <td>${this.formatDate(reservation.fecha_entrada)} - ${this.formatDate(reservation.fecha_salida)}</td>
                    <td>${this.formatPension(reservation.tipo_pension)}</td>
                    <td>${room}</td>
                    <td><span class="badge ${this.badgeForStatus(reservation.estado)}">${this.formatStatus(reservation.estado)}</span></td>
                    <td>${this.renderReservationAction(reservation)}</td>
                </tr>
            `;
        }).join('');
    },

    renderReservationAction(reservation) {
        if (reservation.estado === 'pendiente') {
            return `<button class="btn-action" title="Hacer Check-in" onclick="app.checkInReservation(${reservation.id})"><i class="fa-solid fa-check"></i></button>`;
        }

        return `<button class="btn-action" title="Enviar a checkout" onclick="app.showPanel('panel-checkout', 'Check-out / Facturas')"><i class="fa-solid fa-file-invoice"></i></button>`;
    },

    async checkInReservation(reservationId) {
        this.confirmAction({
            title: 'Confirmar check-in',
            message: 'La reserva cambiara a estado check-in y la habitacion quedara ocupada.',
            confirmText: 'Hacer check-in',
            onConfirm: async () => {
                await api.patch(`/reservas/${reservationId}/checkin`, {});
                this.addActivity('Reservas', `Se realizo check-in de la reserva #${reservationId}.`, 'fa-check');
                this.notify('Check-in realizado.', 'success');
                await this.loadDashboard();
            }
        });
    },

    async loadCompanies() {
        try {
            this.companies = await api.get('/empresas');
            this.renderCompanyOptions();
            this.renderCompanies();
        } catch (error) {
            this.renderTableMessage(this.getCompaniesBody(), error.message, 5);
        }
    },

    renderCompanyOptions() {
        const select = document.getElementById('empresa-id') || document.querySelector('#fila-empresa select');
        if (!select) return;

        select.innerHTML = this.companies
            .map(company => `<option value="${company.id}">${company.nombre}</option>`)
            .join('');
    },

    async loadRoomTypes() {
        try {
            this.roomTypes = await api.get('/habitaciones/tipos');
            this.renderRoomTypeOptions();
        } catch (error) {
            this.notify(error.message, 'error');
        }
    },

    renderRoomTypeOptions() {
        const select = document.getElementById('tipo-habitacion');
        if (!select) return;

        if (!this.roomTypes.length) {
            select.innerHTML = '<option value="">No hay habitaciones disponibles</option>';
            return;
        }

        select.innerHTML = [
            '<option value="" disabled selected>Selecciona un tipo</option>',
            ...this.roomTypes.map(roomType => (
                `<option value="${this.escapeHtml(roomType.tipo)}">${roomType.tipo} (${roomType.total})</option>`
            ))
        ].join('');

        this.loadAvailableRooms();
    },

    ensureReservationRoomFields() {
        if (document.getElementById('tipo-habitacion') && document.getElementById('habitacion-id')) return;

        const datesRow = document.getElementById('fecha-entrada')?.closest('.form-row');
        if (!datesRow) return;

        const row = document.createElement('div');
        row.className = 'form-row';
        row.innerHTML = `
            <div class="form-group">
                <label>Tipo de Habitacion</label>
                <select id="tipo-habitacion" required>
                    <option value="">Cargando tipos...</option>
                </select>
            </div>
            <div class="form-group">
                <label>Habitacion Disponible</label>
                <select id="habitacion-id" required>
                    <option value="">Selecciona fechas y tipo</option>
                </select>
                <small id="habitacion-disponibilidad-msg">La disponibilidad se calcula por fecha.</small>
            </div>
        `;

        datesRow.parentNode.insertBefore(row, datesRow);
    },

    async loadAvailableRooms() {
        const type = document.getElementById('tipo-habitacion')?.value;
        const start = document.getElementById('fecha-entrada')?.value;
        const end = document.getElementById('fecha-salida')?.value;
        const noSmoking = document.getElementById('req-no-fumador')?.checked;
        const select = document.getElementById('habitacion-id');
        const message = document.getElementById('habitacion-disponibilidad-msg');

        if (!select) return;

        if (!type || !start || !end) {
            select.innerHTML = '<option value="">Selecciona fechas y tipo</option>';
            if (message) message.innerText = 'La disponibilidad se calcula por fecha.';
            return;
        }

        if (new Date(start) >= new Date(end)) {
            select.innerHTML = '<option value="">Fechas invalidas</option>';
            if (message) message.innerText = 'La fecha de salida debe ser posterior a la entrada.';
            return;
        }

        const params = new URLSearchParams({
            tipo: type,
            fechaEntrada: start,
            fechaSalida: end,
            noFumador: String(Boolean(noSmoking))
        });

        try {
            this.availableRooms = await api.get(`/habitaciones/disponibles?${params.toString()}`);

            if (!this.availableRooms.length) {
                select.innerHTML = '<option value="">Sin disponibilidad</option>';
                if (message) message.innerText = `No hay habitaciones ${type} disponibles para esas fechas.`;
                return;
            }

            select.innerHTML = [
                '<option value="" disabled selected>Selecciona una habitacion</option>',
                ...this.availableRooms.map(room => (
                    `<option value="${room.id}">${room.numero} - ${room.tipo} (${this.currency(room.precio_noche)})</option>`
                ))
            ].join('');

            if (message) message.innerText = `${this.availableRooms.length} habitacion(es) disponibles.`;
        } catch (error) {
            select.innerHTML = '<option value="">Error de disponibilidad</option>';
            if (message) message.innerText = error.message;
            this.notify(error.message, 'error');
        }
    },

    renderCompanies() {
        const tbody = this.getCompaniesBody();
        if (!tbody) return;

        if (!this.companies.length) {
            this.renderTableMessage(tbody, 'No hay empresas registradas.', 5);
            return;
        }

        tbody.innerHTML = this.companies.map((company) => `
            <tr>
                <td>${company.nombre}</td>
                <td>${Number(company.descuento_porcentaje).toFixed(0)}%</td>
                <td><span class="badge ${company.cuenta_abierta ? 'badge-success' : 'badge-warning'}">${company.cuenta_abierta ? 'Abierta' : 'Cerrada'}</span></td>
                <td>${this.currency(company.facturacion_pendiente)}</td>
                <td>
                    <button class="btn-action" title="Editar" onclick="app.editCompany(${company.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-action text-warning" title="${company.cuenta_abierta ? 'Cerrar Cuenta' : 'Abrir Cuenta'}" onclick="app.toggleCompanyAccount(${company.id})"><i class="fa-solid ${company.cuenta_abierta ? 'fa-ban' : 'fa-lock-open'}"></i></button>
                    <button class="btn-action text-info" title="Generar Factura Mensual" onclick="app.generateMonthlyInvoice(${company.id})"><i class="fa-solid fa-file-invoice-dollar"></i></button>
                </td>
            </tr>
        `).join('');
    },

    async createCompany() {
        this.openCompanyModal();
    },

    async editCompany(companyId) {
        const company = this.companies.find(item => Number(item.id) === Number(companyId));
        if (!company) return;

        this.openCompanyModal(company);
    },

    async toggleCompanyAccount(companyId) {
        const company = this.companies.find(item => Number(item.id) === Number(companyId));
        if (!company) return;

        const nextState = !company.cuenta_abierta;
        const action = nextState ? 'abrir' : 'cerrar';
        this.confirmAction({
            title: `${nextState ? 'Abrir' : 'Cerrar'} cuenta`,
            message: `Se va a ${action} la cuenta corporativa de ${company.nombre}.`,
            confirmText: nextState ? 'Abrir cuenta' : 'Cerrar cuenta',
            onConfirm: async () => {
                await api.patch(`/empresas/${companyId}/cuenta`, { cuenta_abierta: nextState });
                this.addActivity('Empresas', `Se ${nextState ? 'abrio' : 'cerro'} la cuenta de ${company.nombre}.`, nextState ? 'fa-lock-open' : 'fa-ban');
                this.notify('Estado de cuenta actualizado.', 'success');
                await this.loadCompanies();
            }
        });
    },

    async generateMonthlyInvoice(companyId) {
        const company = this.companies.find(item => Number(item.id) === Number(companyId));
        if (!company) return;

        this.confirmAction({
            title: 'Factura mensual',
            message: `Se liquidara la facturacion pendiente de ${company.nombre}.`,
            confirmText: 'Generar factura',
            onConfirm: async () => {
                const result = await api.post(`/empresas/${companyId}/factura-mensual`, {});
                this.addActivity('Facturacion', `Se liquido la cuenta de ${company.nombre} por ${this.currency(result.total)}.`, 'fa-file-invoice-dollar');
                this.notify(`Factura mensual generada por ${this.currency(result.total)}.`, 'success');
                await this.loadCompanies();
            }
        });
    },

    openCompanyModal(company = null) {
        const isEdit = Boolean(company);
        this.openModal({
            title: isEdit ? 'Editar empresa' : 'Nueva empresa',
            body: `
                <form id="company-modal-form" class="modal-form">
                    <div class="modal-grid">
                        <div>
                            <label>Nombre</label>
                            <input name="nombre" type="text" value="${this.escapeHtml(company?.nombre || '')}" required>
                        </div>
                        <div>
                            <label>RFC</label>
                            <input name="rfc" type="text" value="${this.escapeHtml(company?.rfc || '')}">
                        </div>
                        <div>
                            <label>Telefono</label>
                            <input name="telefono" type="text" value="${this.escapeHtml(company?.telefono || '')}">
                        </div>
                        <div>
                            <label>Email contacto</label>
                            <input name="email_contacto" type="email" value="${this.escapeHtml(company?.email_contacto || '')}">
                        </div>
                        <div>
                            <label>Descuento (%)</label>
                            <input name="descuento_porcentaje" type="number" min="0" max="100" step="0.01" value="${Number(company?.descuento_porcentaje || 0)}">
                        </div>
                        <div>
                            <label>Estado</label>
                            <select name="cuenta_abierta">
                                <option value="true" ${company?.cuenta_abierta === false ? '' : 'selected'}>Abierta</option>
                                <option value="false" ${company?.cuenta_abierta === false ? 'selected' : ''}>Cerrada</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-section">
                        <label>Direccion</label>
                        <textarea name="direccion">${this.escapeHtml(company?.direccion || '')}</textarea>
                    </div>
                </form>
            `,
            actions: [
                { text: 'Cancelar', className: 'btn-outline', onClick: () => this.closeModal() },
                {
                    text: isEdit ? 'Guardar cambios' : 'Crear empresa',
                    className: 'btn-primary',
                    onClick: async () => {
                        const form = document.getElementById('company-modal-form');
                        if (!form.reportValidity()) return;

                        const data = Object.fromEntries(new FormData(form).entries());
                        const payload = {
                            ...data,
                            descuento_porcentaje: Number(data.descuento_porcentaje || 0),
                            cuenta_abierta: data.cuenta_abierta === 'true'
                        };

                        if (isEdit) {
                            await api.patch(`/empresas/${company.id}`, payload);
                            this.addActivity('Empresas', `Se actualizo la empresa ${payload.nombre}.`, 'fa-pen');
                            this.notify('Empresa actualizada.', 'success');
                        } else {
                            await api.post('/empresas', payload);
                            this.addActivity('Empresas', `Se registro la empresa ${payload.nombre}.`, 'fa-building');
                            this.notify('Empresa registrada.', 'success');
                        }

                        this.closeModal();
                        await this.loadCompanies();
                    }
                }
            ]
        });
    },

    async createReservation(form) {
        const textInputs = form.querySelectorAll('input[type="text"]');
        const dateInputs = form.querySelectorAll('input[type="date"]');
        const selects = form.querySelectorAll('select');
        const fullName = (document.getElementById('cliente-nombre') || textInputs[0]).value.trim().split(/\s+/);
        const rawPension = (document.getElementById('tipo-pension') || selects[3]).value;
        const payload = {
            tipo_cliente: document.getElementById('tipo-cliente').value,
            nombre: fullName.shift() || '',
            apellidos: fullName.join(' ') || 'Sin apellidos',
            empresa_id: (document.getElementById('empresa-id') || selects[1])?.value || null,
            tarjeta_credito: document.getElementById('tarjeta-credito').value,
            tipo_reserva: (document.getElementById('tipo-reserva') || selects[2]).value,
            tipo_pension: this.normalizePension(rawPension),
            tipo_habitacion: document.getElementById('tipo-habitacion')?.value,
            habitacion_id: document.getElementById('habitacion-id')?.value,
            fecha_entrada: (document.getElementById('fecha-entrada') || dateInputs[0]).value,
            fecha_salida: (document.getElementById('fecha-salida') || dateInputs[1]).value,
            no_fumador: document.getElementById('req-no-fumador').checked
        };

        if (!payload.tipo_habitacion) {
            this.notify('Selecciona el tipo de habitacion.', 'error');
            return;
        }

        if (!payload.habitacion_id) {
            this.notify('Selecciona una habitacion disponible. Si no aparece ninguna, no hay disponibilidad para esas fechas.', 'error');
            return;
        }

        try {
            const reservation = await api.post('/reservas', payload);
            this.addActivity('Reservas', `Se registro una reserva para ${payload.nombre} ${payload.apellidos} en habitacion ${reservation.habitacion} (${reservation.tipo_habitacion}).`, 'fa-calendar-plus');
            this.notify('Reserva registrada con exito.', 'success');
            form.reset();
            this.toggleClientFields();
            await this.loadAvailableRooms();
            await this.showPanel('panel-dashboard', 'Dashboard');
        } catch (error) {
            this.notify(error.message, 'error');
        }
    },

    async loadCheckout() {
        try {
            this.checkoutItems = await api.get('/checkout');
            this.renderCheckout();
        } catch (error) {
            document.getElementById('checkout-list').innerHTML = `<p class="text-muted">${error.message}</p>`;
        }
    },

    renderCheckout() {
        const container = document.getElementById('checkout-list');
        const items = this.checkoutSearch
            ? this.checkoutItems.filter((item) => {
                const text = `${item.cliente} ${item.empresa || ''} ${item.habitacion || ''}`.toLowerCase();
                return text.includes(this.checkoutSearch);
            })
            : this.checkoutItems;

        if (!items.length) {
            container.innerHTML = '<p class="text-muted">No hay habitaciones en check-in listas para facturar.</p>';
            return;
        }

        container.innerHTML = items.map((item) => {
            const company = item.empresa ? ` (${item.empresa})` : '';
            const deferred = item.tipo_cliente === 'empresa' ? 'Empresa - Pago Diferido' : 'Cliente individual';

            return `
                <div class="checkout-details glass-panel mt-3">
                    <div class="checkout-header">
                        <div>
                            <h3>Habitacion ${item.habitacion} - ${item.tipo_habitacion}</h3>
                            <p>${item.cliente}${company}</p>
                        </div>
                        <span class="badge badge-info">${deferred}</span>
                    </div>
                    <div class="charges-list">
                        <h4>Cargos de Estancia</h4>
                        <ul>
                            <li><span>${item.noches} Noches x ${this.currency(item.precio_noche)}</span> <span>${this.currency(item.estancia)}</span></li>
                            <li><span>Cargos extra</span> <span>${this.currency(item.extras)}</span></li>
                        </ul>
                        <div class="discount-row">
                            <span>Descuento Corporativo</span>
                            <span class="text-success">-${this.currency(item.descuento)}</span>
                        </div>
                        <div class="total-row">
                            <span>Total a Facturar</span>
                            <span>${this.currency(item.total)}</span>
                        </div>
                    </div>
                    <div class="form-actions mt-3">
                        <button class="btn-primary" onclick="app.processCheckout(${item.reserva_id})"><i class="fa-solid fa-file-invoice"></i> Generar Factura</button>
                    </div>
                </div>
            `;
        }).join('');
    },

    async processCheckout(reservaId) {
        this.confirmAction({
            title: 'Generar factura',
            message: 'Se procesara el check-out, se generara la factura y la habitacion quedara libre.',
            confirmText: 'Generar factura',
            onConfirm: async () => {
                const result = await api.post(`/checkout/${reservaId}`, {});
                this.addActivity('Facturacion', `Se proceso check-out de la reserva #${reservaId} por ${this.currency(result.total)}.`, 'fa-file-invoice');
                this.notify(`Check-out procesado por ${this.currency(result.total)}.`, 'success');
                await this.loadCheckout();
                await this.loadDashboard();
            }
        });
    },

    async loadAdminSummary() {
        try {
            const summary = await api.get('/admin/resumen');
            const numbers = document.querySelectorAll('#panel-admin .stat-number');
            if (numbers[0]) numbers[0].innerText = summary.usuarios;
            if (numbers[1]) numbers[1].innerText = summary.habitaciones;
        } catch (error) {
            this.notify(error.message, 'error');
        }
    },

    async showRoomsAdmin() {
        try {
            const rooms = await api.get('/admin/habitaciones');
            const rows = rooms.map(room => `
                <tr>
                    <td>${room.numero}</td>
                    <td>${room.tipo}</td>
                    <td>${room.permite_fumadores ? 'Si' : 'No'}</td>
                    <td>${this.currency(room.precio_noche)}</td>
                    <td>
                        <select class="inline-select" onchange="app.updateRoomStatus(${room.id}, this.value)">
                            <option value="libre" ${room.estado === 'libre' ? 'selected' : ''}>Libre</option>
                            <option value="ocupada" ${room.estado === 'ocupada' ? 'selected' : ''}>Ocupada</option>
                            <option value="mantenimiento" ${room.estado === 'mantenimiento' ? 'selected' : ''}>Mantenimiento</option>
                        </select>
                    </td>
                </tr>
            `).join('');

            this.openModal({
                title: 'Gestionar habitaciones',
                body: `
                    <div class="modal-table-wrap">
                        <table class="luxury-table">
                            <thead>
                                <tr>
                                    <th>Numero</th>
                                    <th>Tipo</th>
                                    <th>Fumadores</th>
                                    <th>Precio</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>${rows || '<tr><td colspan="5" class="text-muted">No hay habitaciones registradas.</td></tr>'}</tbody>
                        </table>
                    </div>
                    <div class="modal-section">
                        <h3>Nueva habitacion</h3>
                        <form id="room-modal-form" class="modal-form mt-3">
                            <div class="modal-grid">
                                <div>
                                    <label>Numero</label>
                                    <input name="numero" type="text" required>
                                </div>
                                <div>
                                    <label>Tipo</label>
                                    <select name="tipo" required>
                                        <option value="Estándar">Estándar</option>
                                        <option value="Suite">Suite</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Precio por noche</label>
                                    <input name="precio_noche" type="number" min="0" step="0.01" value="100" required>
                                </div>
                                <div>
                                    <label>Permite fumadores</label>
                                    <select name="permite_fumadores">
                                        <option value="false">No</option>
                                        <option value="true">Si</option>
                                    </select>
                                </div>
                            </div>
                        </form>
                    </div>
                `,
                actions: [
                    { text: 'Cerrar', className: 'btn-outline', onClick: () => this.closeModal() },
                    { text: 'Agregar habitacion', className: 'btn-primary', onClick: () => this.createRoomFromModal() }
                ]
            });
        } catch (error) {
            this.notify(error.message, 'error');
        }
    },

    async createRoomFromModal() {
        const form = document.getElementById('room-modal-form');
        if (!form.reportValidity()) return;

        const data = Object.fromEntries(new FormData(form).entries());
        await api.post('/admin/habitaciones', {
            numero: data.numero,
            tipo: data.tipo || 'Estandar',
            precio_noche: Number(data.precio_noche || 0),
            permite_fumadores: data.permite_fumadores === 'true',
            estado: 'libre'
        });

        this.addActivity('Habitaciones', `Se registro la habitacion ${data.numero}.`, 'fa-bed');
        this.notify('Habitacion registrada.', 'success');
        await this.loadAdminSummary();
        await this.showRoomsAdmin();
    },

    async updateRoomStatus(roomId, status) {
        try {
            await api.patch(`/admin/habitaciones/${roomId}`, { estado: status });
            this.addActivity('Habitaciones', `La habitacion #${roomId} cambio a estado ${status}.`, 'fa-door-open');
            this.notify('Estado de habitacion actualizado.', 'success');
            await this.loadAdminSummary();
        } catch (error) {
            this.notify(error.message, 'error');
        }
    },

    async showUsersAdmin() {
        try {
            const users = await api.get('/admin/usuarios');
            const rows = users.map(user => `
                <tr>
                    <td>${user.nombre}</td>
                    <td>${user.email}</td>
                    <td>${this.formatRole(user.rol)}</td>
                    <td>${new Date(user.creado_en).toLocaleDateString('es-MX')}</td>
                </tr>
            `).join('');

            this.openModal({
                title: 'Usuarios del sistema',
                body: `
                    <div class="modal-table-wrap">
                        <table class="luxury-table">
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Email</th>
                                    <th>Rol</th>
                                    <th>Creado</th>
                                </tr>
                            </thead>
                            <tbody>${rows || '<tr><td colspan="4" class="text-muted">No hay usuarios registrados.</td></tr>'}</tbody>
                        </table>
                    </div>
                `,
                actions: [
                    { text: 'Cerrar', className: 'btn-primary', onClick: () => this.closeModal() }
                ]
            });
        } catch (error) {
            this.notify(error.message, 'error');
        }
    },

    showNotifications() {
        const rows = this.activityLog.map((item) => `
            <tr>
                <td><i class="fa-solid ${item.icon} text-info"></i> ${item.module}</td>
                <td>
                    <strong>${item.message}</strong><br>
                    <small class="text-muted">${this.formatDateTime(item.createdAt)}</small>
                </td>
            </tr>
        `).join('');

        this.openModal({
            title: 'Actividad reciente',
            body: `
                <div class="modal-table-wrap">
                    <table class="luxury-table">
                        <thead>
                            <tr>
                                <th>Modulo</th>
                                <th>Actualizacion</th>
                            </tr>
                        </thead>
                        <tbody>${rows || '<tr><td colspan="2" class="text-muted">Todavia no hay actividad registrada en esta sesion.</td></tr>'}</tbody>
                    </table>
                </div>
            `,
            actions: [
                { text: 'Limpiar historial', className: 'btn-outline', onClick: () => this.clearActivityLog() },
                { text: 'Cerrar', className: 'btn-primary', onClick: () => this.closeModal() }
            ]
        });
    },

    openModal({ title, body, actions = [] }) {
        const root = document.getElementById('modal-root');
        if (!root) return;

        root.innerHTML = `
            <div class="modal-shell" role="dialog" aria-modal="true">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button type="button" class="btn-icon" data-modal-close title="Cerrar"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">${body}</div>
                <div class="modal-footer"></div>
            </div>
        `;

        const footer = root.querySelector('.modal-footer');
        actions.forEach((action) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = action.className || 'btn-secondary';
            button.innerHTML = action.icon ? `<i class="${action.icon}"></i> ${action.text}` : action.text;
            button.addEventListener('click', async () => {
                try {
                    await action.onClick();
                } catch (error) {
                    this.notify(error.message, 'error');
                }
            });
            footer.appendChild(button);
        });

        root.querySelector('[data-modal-close]')?.addEventListener('click', () => this.closeModal());
        root.classList.add('active');
        root.setAttribute('aria-hidden', 'false');
    },

    closeModal() {
        const root = document.getElementById('modal-root');
        if (!root) return;

        root.classList.remove('active');
        root.setAttribute('aria-hidden', 'true');
        root.innerHTML = '';
    },

    confirmAction({ title, message, confirmText, onConfirm }) {
        this.openModal({
            title,
            body: `<p class="text-muted">${message}</p>`,
            actions: [
                { text: 'Cancelar', className: 'btn-outline', onClick: () => this.closeModal() },
                {
                    text: confirmText,
                    className: 'btn-primary',
                    onClick: async () => {
                        await onConfirm();
                        this.closeModal();
                    }
                }
            ]
        });
    },

    notify(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        window.setTimeout(() => {
            toast.remove();
        }, 3600);
    },

    addActivity(module, message, icon = 'fa-circle-info') {
        const activity = {
            module,
            message,
            icon,
            createdAt: new Date().toISOString()
        };

        this.activityLog = [activity, ...this.activityLog].slice(0, 25);
        localStorage.setItem('hotelActivityLog', JSON.stringify(this.activityLog));
    },

    loadActivityLog() {
        try {
            return JSON.parse(localStorage.getItem('hotelActivityLog')) || [];
        } catch (error) {
            return [];
        }
    },

    clearActivityLog() {
        this.activityLog = [];
        localStorage.removeItem('hotelActivityLog');
        this.notify('Historial de actividad limpiado.', 'success');
        this.showNotifications();
    },

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    updateDateDisplay() {
        const dateElement = document.getElementById('current-date');
        if (dateElement) {
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            dateElement.innerText = new Date().toLocaleDateString('es-MX', options);
        }
    },

    toggleClientFields() {
        const tipoCliente = document.getElementById('tipo-cliente').value;
        const filaEmpresa = document.getElementById('fila-empresa');
        const filaTarjeta = document.getElementById('fila-tarjeta');
        const inputTarjeta = document.getElementById('tarjeta-credito');

        if (tipoCliente === 'empresa') {
            filaEmpresa.style.display = 'grid';
            filaTarjeta.style.display = 'none';
            inputTarjeta.removeAttribute('required');
        } else {
            filaEmpresa.style.display = 'none';
            filaTarjeta.style.display = 'grid';
            inputTarjeta.setAttribute('required', 'true');
        }
    },

    getArrivalsBody() {
        return document.getElementById('tbody-arrivals') || document.querySelector('#panel-dashboard tbody');
    },

    getCompaniesBody() {
        return document.getElementById('tbody-empresas') || document.querySelector('#panel-empresas tbody');
    },

    renderTableMessage(tbody, message, colspan) {
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-muted">${message}</td></tr>`;
        }
    },

    formatDate(value) {
        return new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
    },

    formatDateTime(value) {
        return new Date(value).toLocaleString('es-MX', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    formatPension(value) {
        const labels = {
            solo_dormir: 'Solo Dormir',
            media_pension: 'Media Pension',
            pension_completa: 'Pension Completa'
        };
        return labels[value] || value;
    },

    normalizePension(value) {
        const values = {
            media: 'media_pension',
            completa: 'pension_completa'
        };
        return values[value] || value;
    },

    formatStatus(value) {
        const labels = {
            pendiente: 'Pendiente',
            check_in: 'Check-In',
            check_out: 'Check-Out',
            no_show: 'No Show',
            cancelada: 'Cancelada'
        };
        return labels[value] || value;
    },

    badgeForStatus(value) {
        return value === 'check_in' ? 'badge-info' : 'badge-warning';
    },

    formatRole(value) {
        const labels = {
            admin: 'Administrador',
            gerente: 'Gerente',
            recepcion: 'Recepcion'
        };
        return labels[value] || value;
    },

    currency(value) {
        return Number(value || 0).toLocaleString('es-MX', {
            style: 'currency',
            currency: 'MXN'
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
