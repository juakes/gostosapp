// ---------- Estado ----------
let DATA = { gastos: [], ingresos: [], objetivos: {}, sumaAlTotal: {}, categorias: {}, correcciones: {}, recurrentes: [],
  proyectos: [], fuentes: [], movimientos: [], aportes: [], cotizaciones: [], objSub: {} };

const CATEGORIAS_DEFAULT = {
  "Hogar": ["ABL","Expensas","Luz","Gas","Celulares","Internet","Agua","Servicio doméstico","Abonos digitales"],
  "Supermercado": ["Cadena","Chino","Verdulería","Carnes y pescados","Panadería","Casa de pastas","Otros","Comida perro"],
  "Crianza": ["Mesadas","Academia hijo","Inglés","Psicoanálisis hijos","Salud hijo","Cooperadora","Fútbol hijo menor"],
  "Salud": ["Gimnasio","Taller de escritura","Farmacia","Psicoanálisis padre"],
  "Auto": ["Patente","Nafta","Cochera","Mantenimiento","Peajes","Cuota/crédito","Seguro"],
  "Licencias": ["Restaurantes","Delivery"],
  "Movilidad": ["Subte/Sube","DiDi/Uber"],
  "Viajes": [],
  "Regalos": [],
  "Indumentaria y equipamiento": [],
  "Arte y salidas": ["Club Independiente","Cine","Librería"]
};
const OBJETIVOS_DEFAULT = {
  "Hogar": 1220000, "Supermercado": 855000, "Crianza": 950000, "Salud": 540000,
  "Auto": 730000, "Licencias": 500000, "Movilidad": 150000, "Viajes": 0,
  "Regalos": 0, "Indumentaria y equipamiento": 400000, "Arte y salidas": 236000
};
const MODOS_BASE = ['Efectivo','Mercado Pago','Visa Ciudad','Mastercard Ciudad','Visa BBVA','Visa Provincia','Brubank','Transferencia','Otro'];
const TIPOS = [['flexible','Flexible'],['fijo_acumulable','Fijo acumulable'],['fijo','Fijo único']];
const HORIZONTE_MESES = 6;      // cuántos meses hacia adelante se proyectan los recurrentes
const MAX_MESES_ADELANTE = 24;  // hasta dónde se puede navegar hacia el futuro
// Categorías de consumo diario que se proyectan al ritmo del mes en "Esperado al cierre" (solo sus gastos variables)
const CATS_PROYECTABLES = ['Supermercado', 'Licencias', 'Salud y cuidados personales', 'Movilidad'];
