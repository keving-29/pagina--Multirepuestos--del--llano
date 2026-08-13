// =============================================
// CONFIGURACIÓN
// =============================================
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwuyKKRvMW1P2r3T8OmeujvvDCH__zHGBbGY6GAUNfD9jE9vw4xZzVBhcuc9nzBsFCymg/exec';

// =============================================
// ESTADO LOCAL
// =============================================
let DB = {
  usuarios:  [],
  productos: [],
  ventas:    [],
  config:    { stockMin: 5, trasladoContador: 0 }
};

let sesion              = null;
let precioCompraVisible = false;
let carrito             = [];
let editandoProductoId  = null;
let carritoItemEditando = null;
let rapidoProductoActual = null;
let periodoreporte      = 'semana';
let traslado             = [];
let trasladoProductoActual = null;
let facturaVentaActual  = null;
let autoSyncInterval    = null;
let resultadosVenta     = [];
let indiceVenta         = 0;
let resultadosTraslado  = [];
let indiceTraslado      = 0;

// =============================================
// GOOGLE SHEETS
// =============================================
async function sheetsLeer() {
  try {
    setSyncStatus('cargando');
    const r = await fetch(SCRIPT_URL + '?action=getAll');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    setSyncStatus('conectado');
    return d.data || {};
  } catch (e) {
    setSyncStatus('error');
    return null;
  }
}

async function sheetsEscribir(accion, hoja, datos, fila) {
  try {
    setSyncStatus('cargando');
    const r = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ action: accion, sheet: hoja, data: datos, row: fila })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    setSyncStatus('conectado');
    return true;
  } catch (e) {
    setSyncStatus('error');
    return false;
  }
}

async function sincronizar() {
  const datos = await sheetsLeer();
  if (!datos) return;

  if (datos.Productos && datos.Productos.length > 1) {
    DB.productos = datos.Productos.slice(1).map(f => ({
      id: String(f[0]), ref: String(f[1]||''), nombre: String(f[2]||''),
      pcompra: Number(f[3])||0, pventa1: Number(f[4])||0,
      pventa2: Number(f[5])||0, stock: Number(f[6])||0
    }));
  }

  if (datos.Ventas && datos.Ventas.length > 1) {
    DB.ventas = datos.Ventas.slice(1).map(f => ({
      id: String(f[0]), fecha: String(f[1]), hora: String(f[2]),
      total: Number(f[3])||0, ganancia: Number(f[4])||0,
      nota: String(f[5]||''), metodoPago: String(f[6]||'efectivo'),
      items: parsearJSON(f[7])
    }));
  }

  if (datos.Usuarios && datos.Usuarios.length > 1) {
    DB.usuarios = datos.Usuarios.slice(1).map(f => ({
      user: String(f[0]), pass: String(f[1]), rol: String(f[2]||'vendedor')
    }));
  }

  if (datos.Config && datos.Config.length > 1) {
    DB.config.stockMin = Number(datos.Config[1][0]) || 5;
    DB.config.trasladoContador = Number(datos.Config[1][1]) || 0;
  }

  guardarLocal();
  mostrarToast('Datos sincronizados ✓');
}

async function inicializarSheets() {
  const datos = await sheetsLeer();
  if (!datos) return;
  if (!datos.Productos || datos.Productos.length === 0)
    await sheetsEscribir('append', 'Productos', ['ID','Ref','Nombre','PCompra','PVenta1','PVenta2','Stock']);
  if (!datos.Ventas || datos.Ventas.length === 0)
    await sheetsEscribir('append', 'Ventas', ['ID','Fecha','Hora','Total','Ganancia','Nota','MetodoPago','Items']);
  if (!datos.Usuarios || datos.Usuarios.length === 0) {
    await sheetsEscribir('append', 'Usuarios', ['Usuario','Contraseña','Rol']);
    await sheetsEscribir('append', 'Usuarios', ['admin','lubin2812','admin']);
  }
  if (!datos.Config || datos.Config.length === 0) {
    await sheetsEscribir('append', 'Config', ['StockMin','TrasladoContador']);
    await sheetsEscribir('append', 'Config', [5, 0]);
  }
  await sincronizar();
}

// =============================================
// LOCAL STORAGE
// =============================================
function guardarLocal() { localStorage.setItem('kellypk_db', JSON.stringify(DB)); }
function cargarLocal() {
  try { const d = localStorage.getItem('kellypk_db'); if (d) DB = JSON.parse(d); } catch(e) {}
}
function guardarSesion(u) { localStorage.setItem('kellypk_sesion', JSON.stringify(u)); }
function cargarSesion() {
  try { const s = localStorage.getItem('kellypk_sesion'); return s ? JSON.parse(s) : null; } catch(e) { return null; }
}
function borrarSesion() { localStorage.removeItem('kellypk_sesion'); }

// =============================================
// UTILIDADES
// =============================================
function fmt(n) { return '$' + Math.round(n).toLocaleString('es-CO'); }
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function esc(t) {
  return String(t).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function parsearJSON(t) { try { return JSON.parse(t); } catch(e) { return []; } }

// Fecha y hora en formato colombiano (DD/MM/AAAA, 12 horas)
function fechaCO(d = new Date()) {
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
function horaCO(d = new Date()) {
  return d.toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit', hour12:true});
}
function parseFechaCO(str) {
  const [dd,mm,yyyy] = String(str).split('/').map(Number);
  return new Date(yyyy||1970, (mm||1)-1, dd||1);
}
function isoAFechaCO(iso) {
  const [y,m,d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

function setSyncStatus(estado) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = {conectado:'Conectado',cargando:'Sincronizando...',error:'Sin conexión'}[estado]||estado;
  el.className = estado;
}

function mostrarToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 3000);
}

function abrirModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function cerrarModal(id) { document.getElementById(id).classList.add('hidden'); }

// =============================================
// LOGIN
// =============================================
function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  const found = DB.usuarios.find(x => x.user === u && x.pass === p);
  if (found) {
    sesion = found;
    guardarSesion(found);
    entrarAlApp();
    inicializarSheets();
  } else {
    document.getElementById('login-error').classList.remove('hidden');
  }
}

function entrarAlApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('topbar-user').textContent = sesion.user + ' · ' + sesion.rol;
  document.getElementById('hist-fecha').value = new Date().toISOString().split('T')[0];
  mostrarPanel('dashboard');
  iniciarAutoSync();
}

function iniciarAutoSync() {
  if (autoSyncInterval) clearInterval(autoSyncInterval);
  autoSyncInterval = setInterval(() => { if (sesion) sincronizar(); }, 60000);
}

function doLogout() {
  sesion = null; precioCompraVisible = false; carrito = [];
  if (autoSyncInterval) { clearInterval(autoSyncInterval); autoSyncInterval = null; }
  borrarSesion();
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').classList.add('hidden');
}

// =============================================
// NAVEGACIÓN
// =============================================
function mostrarPanel(panel) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + panel).classList.add('active');
  document.querySelector(`.nav-tab[data-tab="${panel}"]`).classList.add('active');

  if (panel === 'dashboard')  renderDashboard();
  if (panel === 'inventario') renderInventario();
  if (panel === 'historial')  renderHistorial();
  if (panel === 'reportes')   renderReportes(periodoreporte);
  if (panel === 'config')     renderConfig();
  if (panel === 'ventas') {
    carrito = [];
    renderCarrito();
    document.getElementById('venta-search').value = '';
    document.getElementById('venta-resultados').innerHTML = '';
    resultadosVenta = [];
    setTimeout(() => document.getElementById('venta-search').focus(), 100);
  }
  if (panel === 'traslado') {
    renderTraslado();
    document.getElementById('traslado-search').value = '';
    document.getElementById('traslado-resultados').innerHTML = '';
    resultadosTraslado = [];
    setTimeout(() => document.getElementById('traslado-search').focus(), 100);
  }
}

// =============================================
// TRASLADO (no afecta stock)
// =============================================
function buscarProductoTraslado() {
  const q = document.getElementById('traslado-search').value.toLowerCase();
  const cont = document.getElementById('traslado-resultados');
  indiceTraslado = 0;
  if (!q) { cont.innerHTML=''; resultadosTraslado=[]; return; }

  resultadosTraslado = DB.productos
    .filter(p => p.nombre.toLowerCase().includes(q) || p.ref.toLowerCase().includes(q))
    .slice(0,8);

  if (resultadosTraslado.length===0) { cont.innerHTML='<p style="font-size:13px;color:var(--texto2);padding:8px 0">Sin resultados</p>'; return; }

  renderResultadosTraslado();
}

function renderResultadosTraslado() {
  const cont = document.getElementById('traslado-resultados');
  cont.innerHTML = `
    <div style="background:var(--card);border:0.5px solid var(--borde);border-radius:12px;overflow:hidden;margin-bottom:1rem;box-shadow:var(--sombra)">
      <div style="padding:8px 12px;background:var(--blush-claro);border-bottom:0.5px solid var(--borde);font-size:11px;color:var(--texto2);font-weight:500;text-transform:uppercase;letter-spacing:0.5px">
        Resultados — ↑↓ para navegar, Enter para agregar
      </div>
      ${resultadosTraslado.map((p,i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:0.5px solid var(--borde);flex-wrap:wrap;gap:8px;${i===indiceTraslado?'background:var(--rosa-claro)':''}">
          <div>
            ${i===indiceTraslado?'<span style="font-size:10px;background:var(--rosa);color:#fff;padding:2px 7px;border-radius:10px;margin-right:6px">↵ Enter</span>':''}
            <span style="font-size:14px;font-weight:500">${esc(p.nombre)}</span>
            <div style="font-size:12px;color:var(--texto2)">Código: ${esc(p.ref)} · Stock: ${p.stock} · P1: ${fmt(p.pventa1)}</div>
          </div>
          <button class="btn-primary btn-agregar-traslado" data-id="${p.id}" style="flex-shrink:0"><i class="ti ti-plus"></i> Agregar</button>
        </div>`).join('')}
    </div>`;

  cont.querySelectorAll('.btn-agregar-traslado').forEach(b =>
    b.addEventListener('click', () => agregarATraslado(b.dataset.id)));
}

function agregarATraslado(id) {
  const p = DB.productos.find(x => x.id===id);
  if (!p) return;
  trasladoProductoActual = p;
  document.getElementById('ct-nombre').textContent = p.nombre;
  document.getElementById('ct-cantidad').value = '1';
  abrirModal('modal-cantidad-traslado');
  setTimeout(() => document.getElementById('ct-cantidad').focus(), 100);

  document.getElementById('traslado-search').value = '';
  document.getElementById('traslado-resultados').innerHTML = '';
}

function cantidadEnTraslado(ref) {
  return traslado.filter(i => i.codigo === ref).reduce((a,i) => a+i.cantidad, 0);
}

function confirmarCantidadTraslado() {
  const cant = parseInt(document.getElementById('ct-cantidad').value) || 0;
  if (cant < 1) { alert('Ingresa una cantidad válida'); return; }
  const p = trasladoProductoActual;
  if (!p) return;

  const disponible = p.stock - cantidadEnTraslado(p.ref);
  if (cant > disponible) { alert(`Solo hay ${Math.max(disponible,0)} unidades disponibles en inventario.`); return; }

  traslado.push({ itemId: uid(), codigo: p.ref, nombre: p.nombre, cantidad: cant, precio: p.pventa1 });
  cerrarModal('modal-cantidad-traslado');
  renderTraslado();
  document.getElementById('traslado-search').focus();
  mostrarToast('Producto agregado al traslado ✓');
}

function eliminarDeTraslado(itemId) {
  traslado = traslado.filter(i => i.itemId !== itemId);
  renderTraslado();
}

function renderTraslado() {
  const cont = document.getElementById('traslado-contenido');
  if (traslado.length === 0) {
    cont.innerHTML = `<div class="estado-vacio"><i class="ti ti-truck"></i><p>Sin productos en el traslado.</p></div>`;
    return;
  }

  const filas = traslado.map((i, idx) => `
    <tr>
      <td>${idx+1}</td>
      <td><code style="background:var(--blush-claro);padding:2px 7px;border-radius:4px;font-size:12px">${esc(i.codigo)}</code></td>
      <td>${esc(i.nombre)}</td>
      <td style="text-align:center">${i.cantidad}</td>
      <td>${fmt(i.precio)}</td>
      <td><button class="btn-peligro btn-quitar-traslado" data-id="${i.itemId}" style="padding:5px 9px"><i class="ti ti-trash"></i></button></td>
    </tr>`).join('');

  cont.innerHTML = `
    <p style="font-size:13px;color:var(--texto2);margin:0.5rem 0">Total de productos: <strong>${traslado.length}</strong></p>
    <div class="tabla-wrap"><table>
    <thead><tr><th>#</th><th>Código</th><th>Nombre</th><th>Cantidad</th><th>Precio</th><th></th></tr></thead>
    <tbody>${filas}</tbody></table></div>`;

  cont.querySelectorAll('.btn-quitar-traslado').forEach(b =>
    b.addEventListener('click', () => eliminarDeTraslado(b.dataset.id)));
}

async function guardarConfigSheet() {
  await sheetsEscribir('clear','Config',null,null);
  await sheetsEscribir('append','Config',['StockMin','TrasladoContador']);
  await sheetsEscribir('append','Config',[DB.config.stockMin, DB.config.trasladoContador]);
}

async function siguienteNumeroTraslado() {
  DB.config.trasladoContador = (DB.config.trasladoContador||0) + 1;
  guardarLocal();
  await guardarConfigSheet();
  return 'TD-N-' + String(DB.config.trasladoContador).padStart(4,'0');
}

function prepararImpresion(idContenedor) {
  document.getElementById('traslado-print').classList.remove('activo');
  document.getElementById('venta-print').classList.remove('activo');
  document.getElementById(idContenedor).classList.add('activo');
}

async function imprimirTraslado() {
  if (traslado.length === 0) { alert('Agrega productos al traslado antes de imprimir'); return; }

  const numero = await siguienteNumeroTraslado();
  const ahora = new Date();
  const fecha = fechaCO(ahora);
  const hora  = horaCO(ahora);

  const filas = traslado.map((i, idx) => `
    <tr>
      <td>${idx+1}</td>
      <td>${esc(i.codigo)}</td>
      <td>${esc(i.nombre)}</td>
      <td style="text-align:center">${i.cantidad}</td>
      <td>${fmt(i.precio)}</td>
    </tr>`).join('');

  document.getElementById('traslado-print-contenido').innerHTML = `
    <div id="tp-header">
      <h1>Multirepuestos del Llano</h1>
      <p>Traslado de productos</p>
      <p style="font-weight:600;margin-top:4px">${numero}</p>
    </div>
    <div id="tp-meta">
      <span><strong>Fecha:</strong> ${fecha}</span>
      <span><strong>Hora:</strong> ${hora}</span>
    </div>
    <table>
      <thead><tr><th>#</th><th>Código</th><th>Nombre</th><th>Cantidad</th><th>Precio</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <p style="margin-top:12px;font-size:13px"><strong>Total de productos:</strong> ${traslado.length}</p>
    <div id="tp-firmas">
      <div class="tp-firma"><div class="tp-linea"></div><span>Quien realiza el traslado</span></div>
      <div class="tp-firma"><div class="tp-linea"></div><span>Quien recibe</span></div>
    </div>
  `;

  prepararImpresion('traslado-print');
  window.print();
}

// =============================================
// DASHBOARD
// =============================================
function renderDashboard() {
  const hoy = fechaCO();
  const ventasHoy = DB.ventas.filter(v => v.fecha === hoy);
  const totalVendido  = ventasHoy.reduce((a,v) => a+v.total, 0);
  const sinStock  = DB.productos.filter(p => p.stock <= 0).length;
  const stockBajo = DB.productos.filter(p => p.stock > 0 && p.stock <= DB.config.stockMin).length;

  document.getElementById('dash-fecha').textContent = 'Hoy · ' + new Date().toLocaleDateString('es-CO',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  document.getElementById('dash-metrics').innerHTML = `
    <div class="metric rosa"><div class="mlabel">Total vendido hoy</div><div class="mvalue">${fmt(totalVendido)}</div></div>
    <div class="metric"><div class="mlabel">Transacciones</div><div class="mvalue">${ventasHoy.length}</div></div>
    <div class="metric"><div class="mlabel">Productos</div><div class="mvalue">${DB.productos.length}</div></div>
    ${stockBajo>0?`<div class="metric alerta"><div class="mlabel">Stock bajo</div><div class="mvalue">${stockBajo}</div></div>`:''}
    ${sinStock>0?`<div class="metric danger"><div class="mlabel">Sin stock</div><div class="mvalue">${sinStock}</div></div>`:''}
  `;

  const cont = document.getElementById('dash-ventas-hoy');
  if (ventasHoy.length === 0) {
    cont.innerHTML = `<div class="estado-vacio"><i class="ti ti-shopping-bag"></i><p>Sin ventas hoy. ¡A vender!</p></div>`;
    return;
  }

  const filas = ventasHoy.slice().reverse().map(v => `
    <tr class="fila-venta-clickeable" data-id="${v.id}">
      <td>${v.hora}</td>
      <td style="font-size:13px">${(v.items||[]).map(i=>esc(i.nombre)+' x'+i.cantidad).join(', ')}</td>
      <td style="font-size:13px;color:var(--texto2)">${v.nota||'-'}</td>
      <td><span class="badge ${v.metodoPago==='transferencia'?'rosa':'verde'}">${v.metodoPago==='transferencia'?'🏦 Transferencia':'💵 Efectivo'}</span></td>
      <td style="font-weight:500">${fmt(v.total)}</td>
      <td style="color:var(--rosa-oscuro);font-weight:500">${fmt(v.ganancia)}</td>
      <td><i class="ti ti-receipt" style="color:var(--rosa-medio);font-size:16px"></i></td>
    </tr>`).join('');

  cont.innerHTML = `<div class="tabla-wrap"><table>
    <thead><tr><th>Hora</th><th>Productos</th><th>Nota</th><th>Pago</th><th>Total</th><th>Ganancia</th><th></th></tr></thead>
    <tbody>${filas}</tbody></table></div>`;

  cont.querySelectorAll('.fila-venta-clickeable').forEach(f =>
    f.addEventListener('click', () => {
      const v = DB.ventas.find(x => x.id === f.dataset.id);
      if (v) abrirFactura(v);
    }));
}

// =============================================
// FACTURA
// =============================================
function abrirFactura(venta) {
  facturaVentaActual = venta;
  const metodoBadge = venta.metodoPago === 'transferencia'
    ? '<span class="badge rosa">🏦 Transferencia</span>'
    : '<span class="badge verde">💵 Efectivo</span>';

  const filas = venta.items.map(i => `
    <tr>
      <td>${esc(i.nombre)}</td>
      <td style="text-align:center">${i.cantidad}</td>
      <td style="text-align:right">${fmt(i.precio)}</td>
      <td style="text-align:right;font-weight:500">${fmt(i.total)}</td>
    </tr>`).join('');

  document.getElementById('factura-contenido').innerHTML = `
    <div style="text-align:center;margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:0.5px solid var(--borde)">
      <div style="font-size:28px;color:var(--rosa);margin-bottom:6px"><i class="ti ti-sparkles"></i></div>
      <h2 style="font-family:var(--fuente-titulo);font-size:22px;color:var(--rosa-oscuro)">Multirepuestos del Llano</h2>
      <p style="font-size:12px;color:var(--texto2);margin-top:4px">Inventario & Ventas</p>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:1rem;font-size:13px;color:var(--texto2)">
      <div><div><strong>Fecha:</strong> ${venta.fecha}</div><div><strong>Hora:</strong> ${venta.hora}</div></div>
      <div style="text-align:right"><div><strong>Método:</strong></div><div style="margin-top:4px">${metodoBadge}</div></div>
    </div>
    ${venta.nota?`<div style="background:var(--blush-claro);padding:8px 12px;border-radius:8px;font-size:13px;color:var(--texto2);margin-bottom:1rem">📝 ${esc(venta.nota)}</div>`:''}
    <div class="tabla-wrap"><table>
      <thead><tr><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Subtotal</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    <div style="margin-top:1rem;padding-top:1rem;border-top:0.5px solid var(--borde)">
      <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:600;color:var(--rosa-oscuro);font-family:var(--fuente-titulo)">
        <span>Total</span><span>${fmt(venta.total)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--texto2);margin-top:6px">
        <span>Ganancia</span><span style="color:var(--rosa-oscuro);font-weight:500">${fmt(venta.ganancia)}</span>
      </div>
    </div>
    <div style="text-align:center;margin-top:1.5rem;padding-top:1rem;border-top:0.5px solid var(--borde);font-size:12px;color:var(--texto3)">¡Gracias por tu compra! 🌸</div>
  `;
  abrirModal('modal-factura');
}

// Boucher de impresión — no muestra ganancias
function imprimirBoucher(venta) {
  const metodoTexto = venta.metodoPago === 'transferencia' ? 'Transferencia' : 'Efectivo';

  const filas = venta.items.map(i => `
    <tr>
      <td>${esc(i.nombre)}</td>
      <td style="text-align:center">${i.cantidad}</td>
      <td style="text-align:right">${fmt(i.precio)}</td>
      <td style="text-align:right">${fmt(i.total)}</td>
    </tr>`).join('');

  document.getElementById('venta-print-contenido').innerHTML = `
    <div id="tp-header">
      <h1>Multirepuestos del Llano</h1>
      <p>Comprobante de venta</p>
    </div>
    <div id="tp-meta">
      <span><strong>Fecha:</strong> ${venta.fecha}</span>
      <span><strong>Hora:</strong> ${venta.hora}</span>
    </div>
    ${venta.nota?`<p style="font-size:13px;margin-bottom:10px"><strong>Nota:</strong> ${esc(venta.nota)}</p>`:''}
    <table>
      <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <p style="margin-top:12px;font-size:14px;text-align:right"><strong>Total: ${fmt(venta.total)}</strong></p>
    <p style="margin-top:4px;font-size:12px;text-align:right">Método de pago: ${metodoTexto}</p>
    <p style="text-align:center;margin-top:20px;font-size:12px">¡Gracias por tu compra!</p>
  `;

  prepararImpresion('venta-print');
  window.print();
}

// =============================================
// INVENTARIO
// =============================================
function renderInventario() {
  const q = document.getElementById('inv-search').value.toLowerCase();
  const prods = DB.productos.filter(p =>
    p.nombre.toLowerCase().includes(q) || p.ref.toLowerCase().includes(q));
  const cont = document.getElementById('inv-contenido');

  if (prods.length === 0) {
    cont.innerHTML = `<div class="estado-vacio"><i class="ti ti-package"></i><p>Sin productos.</p></div>`;
    return;
  }

  const filas = prods.map(p => {
    const badge = p.stock<=0 ? '<span class="badge danger">Sin stock</span>'
      : p.stock<=DB.config.stockMin ? '<span class="badge alerta">Stock bajo</span>'
      : '<span class="badge ok">OK</span>';
    const pc = precioCompraVisible
      ? fmt(p.pcompra)
      : `<span class="precio-oculto" data-id="${p.id}">${fmt(p.pcompra)}</span>`;
    return `<tr>
      <td><code style="background:var(--blush-claro);padding:2px 7px;border-radius:4px;font-size:12px">${esc(p.ref)}</code></td>
      <td>${esc(p.nombre)}</td><td>${pc}</td>
      <td>${fmt(p.pventa1)}</td><td>${p.pventa2?fmt(p.pventa2):'-'}</td>
      <td>${p.stock} ${badge}</td>
      <td><div style="display:flex;gap:6px">
        <button class="btn-secundario btn-editar-producto" data-id="${p.id}" style="padding:6px 10px"><i class="ti ti-edit"></i></button>
        <button class="btn-peligro btn-eliminar-producto" data-id="${p.id}" style="padding:6px 10px"><i class="ti ti-trash"></i></button>
      </div></td>
    </tr>`;
  }).join('');

  cont.innerHTML = `<div class="tabla-wrap"><table>
    <thead><tr><th>Ref</th><th>Nombre</th><th>P.Compra <i class="ti ti-lock" style="font-size:10px"></i></th><th>P.Venta 1</th><th>P.Venta 2</th><th>Stock</th><th>Acciones</th></tr></thead>
    <tbody>${filas}</tbody></table></div>`;

  cont.querySelectorAll('.btn-editar-producto').forEach(b => b.addEventListener('click', () => abrirModalProducto(b.dataset.id)));
  cont.querySelectorAll('.btn-eliminar-producto').forEach(b => b.addEventListener('click', () => eliminarProducto(b.dataset.id)));
  cont.querySelectorAll('.precio-oculto').forEach(b => b.addEventListener('click', pedirPin));
}

function abrirModalProducto(id) {
  editandoProductoId = id || null;
  document.getElementById('modal-prod-titulo').textContent = id ? 'Editar producto' : 'Agregar producto';
  if (id) {
    const p = DB.productos.find(x => x.id === id);
    if (!p) return;
    document.getElementById('prod-ref').value     = p.ref;
    document.getElementById('prod-nombre').value  = p.nombre;
    document.getElementById('prod-pcompra').value = p.pcompra;
    document.getElementById('prod-pventa1').value = p.pventa1;
    document.getElementById('prod-pventa2').value = p.pventa2||'';
    document.getElementById('prod-stock').value   = p.stock;
  } else {
    ['prod-ref','prod-nombre','prod-pcompra','prod-pventa1','prod-pventa2','prod-stock'].forEach(x => document.getElementById(x).value='');
  }
  abrirModal('modal-producto');
}

async function guardarProducto() {
  const ref=document.getElementById('prod-ref').value.trim();
  const nombre=document.getElementById('prod-nombre').value.trim();
  const pcompra=parseFloat(document.getElementById('prod-pcompra').value)||0;
  const pventa1=parseFloat(document.getElementById('prod-pventa1').value)||0;
  const pventa2=parseFloat(document.getElementById('prod-pventa2').value)||0;
  const stock=parseInt(document.getElementById('prod-stock').value)||0;
  if (!ref||!nombre||!pventa1) { alert('Completa los campos obligatorios (*)'); return; }

  const btn = document.getElementById('btn-guardar-producto');
  btn.textContent='Guardando...'; btn.disabled=true;

  if (editandoProductoId) {
    const p = DB.productos.find(x => x.id===editandoProductoId);
    if (p) {
      Object.assign(p,{ref,nombre,pcompra,pventa1,pventa2,stock});
      const idx = DB.productos.findIndex(x => x.id===editandoProductoId);
      await sheetsEscribir('update','Productos',[p.id,p.ref,p.nombre,p.pcompra,p.pventa1,p.pventa2,p.stock],idx+2);
    }
  } else {
    const nuevo={id:uid(),ref,nombre,pcompra,pventa1,pventa2,stock};
    DB.productos.push(nuevo);
    await sheetsEscribir('append','Productos',[nuevo.id,nuevo.ref,nuevo.nombre,nuevo.pcompra,nuevo.pventa1,nuevo.pventa2,nuevo.stock]);
  }

  guardarLocal(); btn.textContent='Guardar'; btn.disabled=false;
  cerrarModal('modal-producto'); renderInventario();
  mostrarToast(editandoProductoId?'Producto actualizado ✓':'Producto agregado ✓');
}

async function eliminarProducto(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  const idx = DB.productos.findIndex(p => p.id===id);
  await sheetsEscribir('delete','Productos',null,idx+2);
  DB.productos = DB.productos.filter(p => p.id!==id);
  guardarLocal(); renderInventario(); mostrarToast('Producto eliminado');
}

// PIN
function pedirPin() {
  document.getElementById('pin-input').value='';
  document.getElementById('pin-error').classList.add('hidden');
  abrirModal('modal-pin');
}
function verificarPin() {
  const p = document.getElementById('pin-input').value;
  const admin = DB.usuarios.find(u => u.rol==='admin' && u.pass===p);
  if (admin) { precioCompraVisible=true; cerrarModal('modal-pin'); renderInventario(); }
  else document.getElementById('pin-error').classList.remove('hidden');
}

// =============================================
// VENTAS — FLUJO RÁPIDO PUNTO 1
// =============================================
function buscarProductoVenta() {
  const q = document.getElementById('venta-search').value.toLowerCase();
  const cont = document.getElementById('venta-resultados');
  indiceVenta = 0;
  if (!q) { cont.innerHTML=''; resultadosVenta=[]; return; }

  resultadosVenta = DB.productos
    .filter(p => (p.nombre.toLowerCase().includes(q)||p.ref.toLowerCase().includes(q)) && p.stock>0)
    .slice(0,8);

  if (resultadosVenta.length===0) { cont.innerHTML='<p style="font-size:13px;color:var(--texto2);padding:8px 0">Sin resultados con stock disponible</p>'; return; }

  renderResultadosVenta();
}

function renderResultadosVenta() {
  const cont = document.getElementById('venta-resultados');
  cont.innerHTML = `
    <div style="background:var(--card);border:0.5px solid var(--borde);border-radius:12px;overflow:hidden;margin-bottom:1rem;box-shadow:0 4px 16px rgba(194,105,143,0.12)">
      <div style="padding:8px 12px;background:var(--blush-claro);border-bottom:0.5px solid var(--borde);font-size:11px;color:var(--texto2);font-weight:500;text-transform:uppercase;letter-spacing:0.5px">
        Resultados — ↑↓ para navegar, Enter para seleccionar
      </div>
      ${resultadosVenta.map((p,i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:0.5px solid var(--borde);flex-wrap:wrap;gap:8px;${i===indiceVenta?'background:var(--rosa-claro)':''}">
          <div>
            ${i===indiceVenta?'<span style="font-size:10px;background:var(--rosa);color:#fff;padding:2px 7px;border-radius:10px;margin-right:6px">↵ Enter</span>':''}
            <span style="font-size:14px;font-weight:500">${esc(p.nombre)}</span>
            <div style="font-size:12px;color:var(--texto2)">Ref: ${esc(p.ref)} · Stock: ${p.stock} · P1: ${fmt(p.pventa1)}${p.pventa2?' · P2: '+fmt(p.pventa2):''}</div>
          </div>
          <button class="btn-primary btn-agregar-rapido" data-id="${p.id}" style="flex-shrink:0"><i class="ti ti-plus"></i> Agregar</button>
        </div>`).join('')}
    </div>`;

  cont.querySelectorAll('.btn-agregar-rapido').forEach(b =>
    b.addEventListener('click', () => abrirFlujRapido(b.dataset.id)));
}

// Flujo rápido: abre modal con cantidad
function abrirFlujRapido(id) {
  const p = DB.productos.find(x => x.id===id);
  if (!p) return;
  rapidoProductoActual = p;

  document.getElementById('rapido-nombre').textContent = p.nombre;
  document.getElementById('rapido-cantidad').value = '1';
  document.getElementById('rapido-paso-cantidad').classList.remove('hidden');
  document.getElementById('rapido-paso-precio').classList.add('hidden');

  abrirModal('modal-rapido');
  setTimeout(() => document.getElementById('rapido-cantidad').focus(), 100);

  // Limpiar búsqueda al abrir
  document.getElementById('venta-search').value = '';
  document.getElementById('venta-resultados').innerHTML = '';
  resultadosVenta = [];
}

// Paso 2: mostrar precios
function rapidoMostrarPrecio() {
  const cant = parseInt(document.getElementById('rapido-cantidad').value)||1;
  if (cant < 1) return;

  const p = rapidoProductoActual;
  const disponible = p.stock - cantidadEnCarrito(p.id);
  if (cant > disponible) {
    alert(`Solo hay ${Math.max(disponible,0)} unidades disponibles de este producto.`);
    return;
  }

  document.getElementById('rapido-paso-cantidad').classList.add('hidden');
  document.getElementById('rapido-paso-precio').classList.remove('hidden');

  const btn1 = document.getElementById('rapido-btn-p1');
  btn1.innerHTML = `<span>Precio 1 — normal</span><strong>${fmt(p.pventa1)}</strong>`;

  const btn2 = document.getElementById('rapido-btn-p2');
  if (p.pventa2) {
    btn2.innerHTML = `<span>Precio 2 — especial</span><strong>${fmt(p.pventa2)}</strong>`;
    btn2.disabled = false;
    btn2.style.opacity = '1';
  } else {
    btn2.innerHTML = `<span>Precio 2</span><span style="color:var(--texto3)">No definido</span>`;
    btn2.disabled = true;
    btn2.style.opacity = '0.4';
  }

  document.getElementById('rapido-precio-custom').value = '';
  setTimeout(() => document.getElementById('rapido-btn-p1').focus(), 100);
}

function cantidadEnCarrito(id) {
  return carrito.filter(i => i.id===id).reduce((a,i) => a+i.cantidad, 0);
}

// Agregar al carrito desde flujo rápido
function rapidoAgregarConPrecio(precio) {
  const p = rapidoProductoActual;
  const cant = parseInt(document.getElementById('rapido-cantidad').value)||1;

  const yaEsta = carrito.find(i => i.id===p.id && i.precio===precio);
  if (yaEsta) {
    yaEsta.cantidad += cant;
    yaEsta.total = yaEsta.cantidad * yaEsta.precio;
  } else {
    carrito.push({
      id: p.id, nombre: p.nombre, ref: p.ref, pcompra: p.pcompra,
      precio, pventa1: p.pventa1, pventa2: p.pventa2,
      cantidad: cant, total: precio * cant
    });
  }

  cerrarModal('modal-rapido');
  renderCarrito();
  mostrarToast(`${p.nombre} agregado al carrito ✓`);

  // Volver al buscador automáticamente
  setTimeout(() => document.getElementById('venta-search').focus(), 150);
}

function renderCarrito() {
  const cont   = document.getElementById('carrito');
  const footer = document.getElementById('venta-footer');

  if (carrito.length===0) { cont.innerHTML=''; footer.classList.add('hidden'); return; }
  footer.classList.remove('hidden');

  cont.innerHTML = `
    <div style="background:var(--card);border:0.5px solid var(--borde);border-radius:12px;overflow:hidden;margin-bottom:1rem">
      <div style="padding:8px 12px;background:var(--rosa-claro);border-bottom:0.5px solid var(--borde);font-size:11px;color:var(--rosa-oscuro);font-weight:500;text-transform:uppercase;letter-spacing:0.5px">
        🛒 Productos en el carrito (${carrito.length})
      </div>
      ${carrito.map((item,idx) => `
        <div class="carrito-item" style="border-radius:0;border-left:none;border-right:none;border-top:none">
          <div class="item-nombre">
            <strong>${esc(item.nombre)}</strong>
            <span>Ref: ${esc(item.ref)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <input type="number" value="${item.cantidad}" min="1" class="input-cantidad-carrito" data-idx="${idx}">
            <button class="btn-dorado btn-cambiar-precio" data-idx="${idx}"><i class="ti ti-tag"></i> ${fmt(item.precio)}</button>
            <span class="item-total">${fmt(item.total)}</span>
            <button class="btn-peligro btn-quitar-carrito" data-idx="${idx}" style="padding:6px 10px"><i class="ti ti-x"></i></button>
          </div>
        </div>`).join('')}
    </div>`;

  document.getElementById('vt-total').textContent = fmt(carrito.reduce((a,i)=>a+i.total,0));

  cont.querySelectorAll('.input-cantidad-carrito').forEach(input => {
    input.addEventListener('change', () => {
      const idx = parseInt(input.dataset.idx);
      const item = carrito[idx];
      const p = DB.productos.find(x=>x.id===item.id);
      const otras = carrito.filter((i,ix)=>ix!==idx && i.id===item.id).reduce((a,i)=>a+i.cantidad,0);
      const disponible = p ? p.stock - otras : Infinity;
      let nuevaCant = Math.max(1, parseInt(input.value)||1);
      if (nuevaCant > disponible) {
        alert(`Solo hay ${Math.max(disponible,0)} unidades disponibles de este producto.`);
        nuevaCant = disponible > 0 ? disponible : 1;
      }
      item.cantidad = nuevaCant;
      item.total = item.cantidad * item.precio;
      renderCarrito();
    });
  });

  cont.querySelectorAll('.btn-cambiar-precio').forEach(b =>
    b.addEventListener('click', () => abrirModalPrecio(parseInt(b.dataset.idx))));

  cont.querySelectorAll('.btn-quitar-carrito').forEach(b =>
    b.addEventListener('click', () => { carrito.splice(parseInt(b.dataset.idx),1); renderCarrito(); }));
}

function abrirModalPrecio(idx) {
  carritoItemEditando = idx;
  const item = carrito[idx];
  document.getElementById('mpv-nombre-producto').textContent = item.nombre;
  const b1 = document.getElementById('mpv-btn-precio1');
  b1.textContent=`Precio 1 — normal: ${fmt(item.pventa1)}`; b1.className='btn-secundario';
  const b2 = document.getElementById('mpv-btn-precio2');
  b2.textContent = item.pventa2?`Precio 2 — especial: ${fmt(item.pventa2)}`:'Precio 2 — no definido';
  b2.disabled = !item.pventa2; b2.className='btn-secundario';
  document.getElementById('mpv-precio-custom').value='';
  abrirModal('modal-precio');
  setTimeout(() => document.getElementById('mpv-btn-precio1').focus(), 100);
}

function seleccionarPrecio(n) {
  const item = carrito[carritoItemEditando];
  item.precio = n===1?item.pventa1:item.pventa2;
  item.total  = item.cantidad*item.precio;
  cerrarModal('modal-precio'); renderCarrito();
}

function aplicarPrecioCustom() {
  const v = parseFloat(document.getElementById('mpv-precio-custom').value);
  if (!v||v<0) { alert('Ingresa un precio válido'); return; }
  const item = carrito[carritoItemEditando];
  item.precio=v; item.total=item.cantidad*v;
  cerrarModal('modal-precio'); renderCarrito();
}

async function confirmarVenta() {
  if (carrito.length===0) return;
  const ahora=new Date();
  const fecha=fechaCO(ahora);
  const hora=horaCO(ahora);
  const total=carrito.reduce((a,i)=>a+i.total,0);
  const ganancia=carrito.reduce((a,i)=>a+(i.precio-i.pcompra)*i.cantidad,0);
  const nota=document.getElementById('venta-nota').value.trim();
  const metodoPago=document.querySelector('input[name="metodo-pago"]:checked').value;

  for (const item of carrito) {
    const p = DB.productos.find(x=>x.id===item.id);
    if (p) {
      p.stock=Math.max(0,p.stock-item.cantidad);
      const idx=DB.productos.findIndex(x=>x.id===item.id);
      await sheetsEscribir('update','Productos',[p.id,p.ref,p.nombre,p.pcompra,p.pventa1,p.pventa2,p.stock],idx+2);
    }
  }

  const venta={id:uid(),fecha,hora,total,ganancia,nota,metodoPago,items:carrito.map(i=>({...i}))};
  DB.ventas.push(venta);
  await sheetsEscribir('append','Ventas',[venta.id,venta.fecha,venta.hora,venta.total,venta.ganancia,venta.nota,venta.metodoPago,JSON.stringify(venta.items)]);

  guardarLocal();
  mostrarToast(`Venta registrada · ${metodoPago==='transferencia'?'🏦':'💵'} ${fmt(total)}`);
  imprimirBoucher(venta);

  carrito=[];
  renderCarrito();
  document.getElementById('venta-search').value='';
  document.getElementById('venta-resultados').innerHTML='';
  resultadosVenta=[];
  document.getElementById('venta-nota').value='';
  document.querySelector('input[name="metodo-pago"][value="efectivo"]').checked=true;
  setTimeout(()=>document.getElementById('venta-search').focus(),150);
}

// =============================================
// HISTORIAL
// =============================================
function renderHistorial() {
  const fechaISO=document.getElementById('hist-fecha').value;
  const fecha=isoAFechaCO(fechaISO);
  const ventas=DB.ventas.filter(v=>v.fecha===fecha).slice().reverse();
  const summary=document.getElementById('hist-summary');
  const cont=document.getElementById('hist-contenido');

  if (ventas.length===0) {
    summary.innerHTML='';
    cont.innerHTML=`<div class="estado-vacio"><i class="ti ti-history"></i><p>Sin ventas en esta fecha</p></div>`;
    return;
  }

  const totalDia=ventas.reduce((a,v)=>a+v.total,0);
  const ganDia=ventas.reduce((a,v)=>a+v.ganancia,0);
  const efectivo=ventas.filter(v=>v.metodoPago!=='transferencia').reduce((a,v)=>a+v.total,0);
  const transferencia=ventas.filter(v=>v.metodoPago==='transferencia').reduce((a,v)=>a+v.total,0);

  summary.innerHTML=`<div id="dash-metrics" style="margin-bottom:1rem">
    <div class="metric rosa" style="display:inline-block;margin-right:12px;margin-bottom:8px;min-width:160px"><div class="mlabel">Total vendido</div><div class="mvalue">${fmt(totalDia)}</div></div>
    <div class="metric rosa" style="display:inline-block;margin-right:12px;margin-bottom:8px;min-width:160px"><div class="mlabel">Ganancia total</div><div class="mvalue">${fmt(ganDia)}</div></div>
    <div class="metric" style="display:inline-block;margin-right:12px;margin-bottom:8px;min-width:140px"><div class="mlabel">💵 Efectivo</div><div class="mvalue">${fmt(efectivo)}</div></div>
    <div class="metric" style="display:inline-block;margin-bottom:8px;min-width:160px"><div class="mlabel">🏦 Transferencia</div><div class="mvalue">${fmt(transferencia)}</div></div>
  </div>`;

  const filas=ventas.map(v=>`
    <tr>
      <td>${v.hora}</td>
      <td style="font-size:13px">${(v.items||[]).map(i=>esc(i.nombre)+' x'+i.cantidad).join('<br>')}</td>
      <td style="font-size:13px;color:var(--texto2)">${v.nota||'-'}</td>
      <td><span class="badge ${v.metodoPago==='transferencia'?'rosa':'verde'}">${v.metodoPago==='transferencia'?'🏦 Transferencia':'💵 Efectivo'}</span></td>
      <td style="font-weight:500">${fmt(v.total)}</td>
      <td style="color:var(--rosa-oscuro);font-weight:500">${fmt(v.ganancia)}</td>
      <td><div style="display:flex;gap:6px">
        <button class="btn-secundario btn-ver-factura" data-id="${v.id}" style="padding:5px 9px"><i class="ti ti-receipt"></i></button>
        <button class="btn-peligro btn-eliminar-venta" data-id="${v.id}" style="padding:5px 9px"><i class="ti ti-trash"></i></button>
      </div></td>
    </tr>`).join('');

  cont.innerHTML=`<div class="tabla-wrap"><table>
    <thead><tr><th>Hora</th><th>Productos</th><th>Nota</th><th>Pago</th><th>Total</th><th>Ganancia</th><th></th></tr></thead>
    <tbody>${filas}</tbody></table></div>`;

  cont.querySelectorAll('.btn-ver-factura').forEach(b=>b.addEventListener('click',()=>{
    const v=DB.ventas.find(x=>x.id===b.dataset.id); if(v) abrirFactura(v);
  }));
  cont.querySelectorAll('.btn-eliminar-venta').forEach(b=>b.addEventListener('click',()=>eliminarVenta(b.dataset.id)));
}

async function eliminarVenta(id) {
  if (!confirm('¿Eliminar esta venta? El stock no se restaura.')) return;
  DB.ventas=DB.ventas.filter(v=>v.id!==id);
  guardarLocal();
  await sheetsEscribir('clear','Ventas',null,null);
  await sheetsEscribir('append','Ventas',['ID','Fecha','Hora','Total','Ganancia','Nota','MetodoPago','Items']);
  for (const v of DB.ventas)
    await sheetsEscribir('append','Ventas',[v.id,v.fecha,v.hora,v.total,v.ganancia,v.nota,v.metodoPago,JSON.stringify(v.items)]);
  renderHistorial(); renderDashboard(); mostrarToast('Venta eliminada');
}

// =============================================
// REPORTES — PUNTO 2
// =============================================
function getRangoPeriodo(periodo) {
  const hoy = new Date();
  let desde, hasta;

  if (periodo === 'dia') {
    desde = new Date(hoy); desde.setHours(0,0,0,0);
    hasta = new Date(hoy); hasta.setHours(23,59,59,999);
  } else if (periodo === 'semana') {
    // Lunes de esta semana
    const dia = hoy.getDay();
    const diff = dia === 0 ? -6 : 1 - dia;
    desde = new Date(hoy); desde.setDate(hoy.getDate() + diff); desde.setHours(0,0,0,0);
    hasta = new Date(hoy); hasta.setHours(23,59,59,999);
  } else if (periodo === 'mes') {
    desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    hasta = new Date(hoy); hasta.setHours(23,59,59,999);
  } else {
    desde = new Date(hoy.getFullYear(), 0, 1);
    hasta = new Date(hoy); hasta.setHours(23,59,59,999);
  }

  return { desde, hasta };
}

function renderReportes(periodo) {
  periodoreporte = periodo;

  // Actualizar botones activos
  document.querySelectorAll('.btn-reporte').forEach(b => {
    b.classList.toggle('active', b.dataset.periodo === periodo);
  });

  const { desde, hasta } = getRangoPeriodo(periodo);
  const ventas = DB.ventas.filter(v => {
    const d = parseFechaCO(v.fecha);
    return d >= desde && d <= hasta;
  });

  const totalVendido   = ventas.reduce((a,v)=>a+v.total,0);
  const totalGanancia  = ventas.reduce((a,v)=>a+v.ganancia,0);
  const totalEfectivo  = ventas.filter(v=>v.metodoPago!=='transferencia').reduce((a,v)=>a+v.total,0);
  const totalTransf    = ventas.filter(v=>v.metodoPago==='transferencia').reduce((a,v)=>a+v.total,0);
  const ganEfectivo    = ventas.filter(v=>v.metodoPago!=='transferencia').reduce((a,v)=>a+v.ganancia,0);
  const ganTransf      = ventas.filter(v=>v.metodoPago==='transferencia').reduce((a,v)=>a+v.ganancia,0);

  const labels = { dia:'hoy', semana:'esta semana', mes:'este mes', año:'este año' };
  const tituloTabla = { dia:'Ventas de hoy', semana:'Ventas de la semana', mes:'Ventas del mes', año:'Ventas del año' };

  // Métricas principales
  document.getElementById('reporte-metrics').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:1.5rem">
      <div class="metric rosa"><div class="mlabel">Total vendido ${labels[periodo]}</div><div class="mvalue">${fmt(totalVendido)}</div></div>
      <div class="metric rosa"><div class="mlabel">Ganancia ${labels[periodo]}</div><div class="mvalue">${fmt(totalGanancia)}</div></div>
      <div class="metric"><div class="mlabel">Transacciones</div><div class="mvalue">${ventas.length}</div></div>
    </div>`;

  // Desglose por método de pago
  document.getElementById('reporte-pago').innerHTML = `
    <div class="reporte-pago-card">
      <span class="rp-icon">💵</span>
      <div class="rp-label">Ventas en Efectivo</div>
      <div class="rp-value">${fmt(totalEfectivo)}</div>
      <div class="rp-sub">Ganancia: ${fmt(ganEfectivo)}</div>
    </div>
    <div class="reporte-pago-card">
      <span class="rp-icon">🏦</span>
      <div class="rp-label">Ventas por Transferencia</div>
      <div class="rp-value">${fmt(totalTransf)}</div>
      <div class="rp-sub">Ganancia: ${fmt(ganTransf)}</div>
    </div>
    <div class="reporte-pago-card" style="border:0.5px solid var(--rosa-medio)">
      <span class="rp-icon">📊</span>
      <div class="rp-label">Total combinado</div>
      <div class="rp-value">${fmt(totalVendido)}</div>
      <div class="rp-sub">Ganancia total: ${fmt(totalGanancia)}</div>
    </div>`;

  document.getElementById('reporte-titulo-tabla').textContent = tituloTabla[periodo];

  // Tabla de ventas del periodo
  const cont = document.getElementById('reporte-contenido');
  if (ventas.length === 0) {
    cont.innerHTML=`<div class="estado-vacio"><i class="ti ti-chart-pie"></i><p>Sin ventas en este periodo</p></div>`;
    return;
  }

  const filas = ventas.slice().reverse().map(v=>`
    <tr class="fila-venta-clickeable" data-id="${v.id}">
      <td>${v.fecha}</td>
      <td>${v.hora}</td>
      <td style="font-size:13px">${(v.items||[]).map(i=>esc(i.nombre)+' x'+i.cantidad).join(', ')}</td>
      <td><span class="badge ${v.metodoPago==='transferencia'?'rosa':'verde'}">${v.metodoPago==='transferencia'?'🏦 Trans.':'💵 Efect.'}</span></td>
      <td style="font-weight:500">${fmt(v.total)}</td>
      <td style="color:var(--rosa-oscuro);font-weight:500">${fmt(v.ganancia)}</td>
      <td><button class="btn-secundario btn-ver-factura-rep" data-id="${v.id}" style="padding:5px 9px"><i class="ti ti-receipt"></i></button></td>
    </tr>`).join('');

  cont.innerHTML=`<div class="tabla-wrap"><table>
    <thead><tr><th>Fecha</th><th>Hora</th><th>Productos</th><th>Pago</th><th>Total</th><th>Ganancia</th><th></th></tr></thead>
    <tbody>${filas}</tbody></table></div>`;

  cont.querySelectorAll('.fila-venta-clickeable').forEach(f=>
    f.addEventListener('click',()=>{
      const v=DB.ventas.find(x=>x.id===f.dataset.id); if(v) abrirFactura(v);
    }));
  cont.querySelectorAll('.btn-ver-factura-rep').forEach(b=>
    b.addEventListener('click', e => {
      e.stopPropagation();
      const v=DB.ventas.find(x=>x.id===b.dataset.id); if(v) abrirFactura(v);
    }));
}

// =============================================
// CONFIGURACIÓN
// =============================================
function renderConfig() {
  document.getElementById('conf-stock-min').value = DB.config.stockMin;
  const lista = document.getElementById('usuarios-list');
  lista.innerHTML = DB.usuarios.map((u,i)=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:var(--blush-claro);border-radius:8px;margin-bottom:6px;border:0.5px solid var(--borde)">
      <div><span style="font-weight:500">${esc(u.user)}</span>
      <span class="badge ${u.rol==='admin'?'rosa':'ok'}" style="margin-left:8px">${u.rol}</span></div>
      ${DB.usuarios.length>1?`<button class="btn-peligro btn-eliminar-usuario" data-idx="${i}" style="padding:5px 9px"><i class="ti ti-trash"></i></button>`:''}
    </div>`).join('');
  lista.querySelectorAll('.btn-eliminar-usuario').forEach(b=>b.addEventListener('click',()=>eliminarUsuario(parseInt(b.dataset.idx))));
}

async function agregarUsuario() {
  const user=document.getElementById('nu-user').value.trim();
  const pass=document.getElementById('nu-pass').value;
  const rol=document.getElementById('nu-rol').value;
  if (!user||!pass) { alert('Completa usuario y contraseña'); return; }
  if (DB.usuarios.find(u=>u.user===user)) { alert('Ese usuario ya existe'); return; }
  DB.usuarios.push({user,pass,rol}); guardarLocal();
  await sheetsEscribir('append','Usuarios',[user,pass,rol]);
  document.getElementById('nu-user').value=''; document.getElementById('nu-pass').value='';
  renderConfig(); mostrarToast('Usuario agregado ✓');
}

function eliminarUsuario(idx) {
  if (!confirm('¿Eliminar este usuario?')) return;
  DB.usuarios.splice(idx,1); guardarLocal(); renderConfig(); mostrarToast('Usuario eliminado');
}

async function guardarConfig() {
  DB.config.stockMin=parseInt(document.getElementById('conf-stock-min').value)||5;
  guardarLocal();
  await guardarConfigSheet();
  mostrarToast('Configuración guardada ✓');
}

// =============================================
// NAVEGACIÓN CON TECLADO
// =============================================
// Permite moverse con ↑/↓ entre botones/campos de un contenedor (Enter ya activa el botón enfocado)
function habilitarNavegacionFlechas(contenedorId) {
  const contenedor = document.getElementById(contenedorId);
  contenedor.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const focusables = Array.from(contenedor.querySelectorAll('button:not([disabled]), input'))
      .filter(el => el.offsetParent !== null);
    if (focusables.length === 0) return;
    const idx = focusables.indexOf(document.activeElement);
    e.preventDefault();
    if (idx === -1) { focusables[0].focus(); return; }
    const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
    focusables[Math.max(0, Math.min(focusables.length - 1, next))].focus();
  });
}

// Enter avanza al siguiente campo del formulario; en el último, ejecuta onFinal
function habilitarEnterAvanza(ids, onFinal) {
  ids.forEach((id, i) => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const siguiente = ids[i+1];
      if (siguiente) document.getElementById(siguiente).focus();
      else onFinal();
    });
  });
}

// =============================================
// EVENTOS
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  cargarLocal();
  if (DB.usuarios.length===0) DB.usuarios=[{user:'admin',pass:'lubin2812',rol:'admin'}];
  if (DB.config.trasladoContador === undefined) DB.config.trasladoContador = 0;

  // Sesión persistente
  const sesionGuardada = cargarSesion();
  if (sesionGuardada) {
    const valido = DB.usuarios.find(u=>u.user===sesionGuardada.user&&u.pass===sesionGuardada.pass);
    if (valido) { sesion=valido; entrarAlApp(); sincronizar(); }
  }

  // Login
  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('login-pass').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', doLogout);

  // Navegación
  document.querySelectorAll('.nav-tab').forEach(t=>t.addEventListener('click',()=>mostrarPanel(t.dataset.tab)));
  document.querySelector('[data-goto="ventas"]').addEventListener('click',()=>mostrarPanel('ventas'));

  // Cerrar modales
  document.querySelectorAll('.btn-cerrar-modal').forEach(b=>b.addEventListener('click',()=>cerrarModal(b.dataset.modal)));
  document.querySelectorAll('.modal-bg').forEach(bg=>bg.addEventListener('click',e=>{ if(e.target===bg) bg.classList.add('hidden'); }));

  // Inventario
  document.getElementById('btn-abrir-modal-producto').addEventListener('click',()=>abrirModalProducto(null));
  document.getElementById('btn-guardar-producto').addEventListener('click', guardarProducto);
  document.getElementById('inv-search').addEventListener('input', renderInventario);
  habilitarEnterAvanza(['prod-ref','prod-nombre','prod-pcompra','prod-pventa1','prod-pventa2','prod-stock'], guardarProducto);

  // Factura / boucher
  document.getElementById('btn-imprimir-boucher').addEventListener('click', () => {
    if (facturaVentaActual) imprimirBoucher(facturaVentaActual);
  });

  // PIN
  document.getElementById('btn-verificar-pin').addEventListener('click', verificarPin);
  document.getElementById('pin-input').addEventListener('keydown',e=>{ if(e.key==='Enter') verificarPin(); });

  // Ventas — búsqueda con flechas y Enter
  const ventaSearch = document.getElementById('venta-search');
  ventaSearch.addEventListener('input', buscarProductoVenta);
  ventaSearch.addEventListener('keydown', e => {
    if (resultadosVenta.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      indiceVenta = Math.min(indiceVenta + 1, resultadosVenta.length - 1);
      renderResultadosVenta();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      indiceVenta = Math.max(indiceVenta - 1, 0);
      renderResultadosVenta();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const p = resultadosVenta[indiceVenta];
      if (p) abrirFlujRapido(p.id);
    }
  });

  document.getElementById('btn-limpiar-carrito').addEventListener('click',()=>{ carrito=[]; renderCarrito(); });
  document.getElementById('btn-confirmar-venta').addEventListener('click', confirmarVenta);

  // Modal precio (carrito)
  document.getElementById('mpv-btn-precio1').addEventListener('click',()=>seleccionarPrecio(1));
  document.getElementById('mpv-btn-precio2').addEventListener('click',()=>seleccionarPrecio(2));
  document.getElementById('btn-aplicar-precio').addEventListener('click', aplicarPrecioCustom);
  habilitarNavegacionFlechas('modal-precio');
  habilitarNavegacionFlechas('modal-rapido');

  // Flujo rápido — cantidad
  document.getElementById('btn-rapido-siguiente').addEventListener('click', rapidoMostrarPrecio);
  document.getElementById('rapido-cantidad').addEventListener('keydown', e=>{ if(e.key==='Enter') rapidoMostrarPrecio(); });

  // Flujo rápido — precio
  document.getElementById('rapido-btn-p1').addEventListener('click',()=>{
    rapidoAgregarConPrecio(rapidoProductoActual.pventa1);
  });
  document.getElementById('rapido-btn-p2').addEventListener('click',()=>{
    rapidoAgregarConPrecio(rapidoProductoActual.pventa2);
  });
  document.getElementById('rapido-btn-custom').addEventListener('click',()=>{
    const v = parseFloat(document.getElementById('rapido-precio-custom').value);
    if (!v||v<0) { alert('Ingresa un precio válido'); return; }
    rapidoAgregarConPrecio(v);
  });
  document.getElementById('rapido-precio-custom').addEventListener('keydown',e=>{
    if (e.key==='Enter') {
      const v=parseFloat(document.getElementById('rapido-precio-custom').value);
      if (v&&v>0) rapidoAgregarConPrecio(v);
    }
  });

  // Traslado — búsqueda con flechas y Enter
  const trasladoSearch = document.getElementById('traslado-search');
  trasladoSearch.addEventListener('input', buscarProductoTraslado);
  trasladoSearch.addEventListener('keydown', e => {
    if (resultadosTraslado.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      indiceTraslado = Math.min(indiceTraslado + 1, resultadosTraslado.length - 1);
      renderResultadosTraslado();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      indiceTraslado = Math.max(indiceTraslado - 1, 0);
      renderResultadosTraslado();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const p = resultadosTraslado[indiceTraslado];
      if (p) agregarATraslado(p.id);
    }
  });
  document.getElementById('btn-limpiar-traslado').addEventListener('click', () => {
    if (traslado.length===0) return;
    if (!confirm('¿Vaciar la lista de traslado?')) return;
    traslado = []; renderTraslado();
  });
  document.getElementById('btn-imprimir-traslado').addEventListener('click', imprimirTraslado);
  document.getElementById('btn-ct-agregar').addEventListener('click', confirmarCantidadTraslado);
  document.getElementById('ct-cantidad').addEventListener('keydown', e => { if (e.key==='Enter') confirmarCantidadTraslado(); });

  // Historial
  document.getElementById('hist-fecha').addEventListener('change', renderHistorial);

  // Reportes
  document.querySelectorAll('.btn-reporte').forEach(b=>
    b.addEventListener('click',()=>renderReportes(b.dataset.periodo)));

  // Config
  document.getElementById('btn-agregar-usuario').addEventListener('click', agregarUsuario);
  document.getElementById('btn-guardar-config').addEventListener('click', guardarConfig);
});