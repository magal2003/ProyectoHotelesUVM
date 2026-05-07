/**
 * Grand Luxe Hotel - Frontend Logic
 * Simulates SPA routing and dynamic UI interactions based on user roles
 */

const app = {
    currentUser: null,
    
    // Navigation Menus defined by role
    menus: {
        recepcion: [
            { id: 'panel-dashboard', icon: 'fa-solid fa-chart-pie', text: 'Dashboard' },
            { id: 'panel-nueva-reserva', icon: 'fa-solid fa-calendar-plus', text: 'Nueva Reserva' },
            { id: 'panel-checkout', icon: 'fa-solid fa-file-invoice', text: 'Check-out / Facturas' }
        ],
        gerente: [
            { id: 'panel-empresas', icon: 'fa-solid fa-building', text: 'Gestión de Empresas' },
            { id: 'panel-checkout', icon: 'fa-solid fa-file-invoice-dollar', text: 'Facturación Mensual' }
        ],
        admin: [
            { id: 'panel-admin', icon: 'fa-solid fa-screwdriver-wrench', text: 'Mantenimiento del Sistema' },
            { id: 'panel-dashboard', icon: 'fa-solid fa-chart-pie', text: 'Vista Global' }
        ]
    },

    init: function() {
        this.bindEvents();
        this.updateDateDisplay();
        
        // Simular que no hay usuario logueado al inicio
        document.getElementById('login-view').classList.add('active-view');
        document.getElementById('app-view').classList.remove('active-view');
    },

    bindEvents: function() {
        // Formulario de login
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.login();
            });
        }

        // Botón de logout
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }

        // Formulario de nueva reserva (simulación)
        const formReserva = document.getElementById('form-reserva');
        if (formReserva) {
            formReserva.addEventListener('submit', (e) => {
                e.preventDefault();
                alert('¡Reserva registrada con éxito!');
                this.showPanel('panel-dashboard');
                formReserva.reset();
                this.toggleClientFields(); // reset visibility
            });
        }
    },

    login: function() {
        const username = document.getElementById('username').value;
        const role = document.getElementById('role-select').value;

        if (!role) {
            alert('Por favor selecciona un rol');
            return;
        }

        this.currentUser = { name: username, role: role };
        
        // Actualizar UI
        document.getElementById('current-user-name').innerText = username;
        document.getElementById('current-role-name').innerText = role.charAt(0).toUpperCase() + role.slice(1);
        
        this.renderNavigation();
        
        // Cambiar vistas
        document.getElementById('login-view').classList.remove('active-view');
        document.getElementById('app-view').classList.add('active-view');
    },

    logout: function() {
        this.currentUser = null;
        document.getElementById('login-form').reset();
        
        // Cambiar vistas
        document.getElementById('app-view').classList.remove('active-view');
        document.getElementById('login-view').classList.add('active-view');
    },

    renderNavigation: function() {
        const navList = document.getElementById('nav-links');
        navList.innerHTML = ''; // Clear previous

        const menuItems = this.menus[this.currentUser.role] || [];
        
        menuItems.forEach((item, index) => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = '#';
            a.innerHTML = `<i class="${item.icon}"></i> ${item.text}`;
            
            // First item is active by default
            if (index === 0) {
                a.classList.add('active');
                this.showPanel(item.id, item.text);
            }

            a.addEventListener('click', (e) => {
                e.preventDefault();
                // Remove active from all
                document.querySelectorAll('.nav-links a').forEach(link => link.classList.remove('active'));
                a.classList.add('active');
                this.showPanel(item.id, item.text);
            });

            li.appendChild(a);
            navList.appendChild(li);
        });
    },

    showPanel: function(panelId, title = null) {
        // Ocultar todos los paneles
        document.querySelectorAll('.panel').forEach(panel => {
            panel.classList.remove('active-panel');
        });
        
        // Mostrar el seleccionado
        const targetPanel = document.getElementById(panelId);
        if (targetPanel) {
            targetPanel.classList.add('active-panel');
        }

        // Actualizar título
        if (title) {
            document.getElementById('page-title').innerText = title;
        }
    },

    updateDateDisplay: function() {
        const dateElement = document.getElementById('current-date');
        if (dateElement) {
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            const today = new Date();
            dateElement.innerText = today.toLocaleDateString('es-MX', options);
        }
    },

    // Lógica específica para el formulario de reserva
    toggleClientFields: function() {
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

    // Simular el proceso de facturación
    processCheckout: function(isCorporate) {
        if(isCorporate) {
            alert('Se ha generado y enviado la factura corporativa para TechCorp Solutions por el total de su estancia.');
        } else {
            alert('Check-out procesado exitosamente y factura generada para el cliente individual.');
        }
        this.showPanel('panel-dashboard');
    }
};

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
