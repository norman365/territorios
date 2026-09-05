const DIAS_NOMBRE = [
  "DOMINGO",
  "LUNES",
  "MARTES",
  "MIÉRCOLES",
  "JUEVES",
  "VIERNES",
  "SÁBADO"
];

const MANZANAS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
const GRUPOS = [1, 2, 3, 4, 5];
const REUNIONES = {
  4: "20:00", // jueves
  6: "19:00"  // sábado
};

const COLOR_LILA = "#C39CEB";
const COLOR_HEADER_GRAY = "#B7B7B7";

let programaActual = null;
let salidaUidSeq = 1;

function horariosDisponibles() {
  const out = [];
  const pushRango = (desdeH, hastaH) => {
    for (let h = desdeH; h <= hastaH; h++) {
      for (let m = 0; m < 60; m += 15) {
        if (h === hastaH && m > 0) break;
        out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
  };
  pushRango(8, 11);
  pushRango(16, 21);
  return out;
}

const HORARIOS = horariosDisponibles();

function pad2(n) {
  return String(n).padStart(2, "0");
}

function fechaISOLocal(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function sumarDiasISO(iso, dias) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + dias);
  return fechaISOLocal(d);
}

function formatearFechaCorta(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function domingoDe(fecha = new Date()) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  d.setDate(d.getDate() - d.getDay());
  return fechaISOLocal(d);
}

function esDomingoISO(iso) {
  return parseISODate(iso).getDay() === 0;
}

function nuevoUid() {
  return `s${salidaUidSeq++}`;
}

function salidaVacia(dia, horario = "10:00") {
  return {
    uid: nuevoUid(),
    dia,
    horario,
    conductor: "",
    punto_encuentro: "",
    grupos: [],
    territorios: [],
    manzanas: []
  };
}

function programaVacio(domingo) {
  return {
    id: null,
    domingo,
    recordatorio_desde: sumarDiasISO(domingo, 1),
    recordatorio_hasta: sumarDiasISO(domingo, 7),
    recordatorio_grupo: 1,
    items: []
  };
}

function ordenarItems(items) {
  return items.slice().sort((a, b) => {
    if (a.dia !== b.dia) return a.dia - b.dia;
    if (a.horario !== b.horario) return a.horario.localeCompare(b.horario);
    const ga = (a.grupos || []).slice().sort((x, y) => x - y).join("-");
    const gb = (b.grupos || []).slice().sort((x, y) => x - y).join("-");
    return ga.localeCompare(gb);
  });
}

function prepararVistaSalidas() {
  const input = document.getElementById("salidasDomingo");
  if (!input.value) input.value = domingoDe(new Date());

  input.onchange = () => {
    if (input.value && !esDomingoISO(input.value)) {
      mostrarToast("Elegí un domingo (inicio de semana).", "error");
      input.value = domingoDe(parseISODate(input.value));
    }
  };

  habilitarAperturaCalendario();
}

async function cargarProgramaSemana() {
  const domingo = document.getElementById("salidasDomingo").value;
  if (!domingo) {
    mostrarToast("Seleccioná el domingo de la semana.", "error");
    return;
  }
  if (!esDomingoISO(domingo)) {
    mostrarToast("La fecha debe ser un domingo.", "error");
    return;
  }

  try {
    const { data, error } = await db
      .from("salidas_programa")
      .select("*, salidas_item(*)")
      .eq("domingo", domingo)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (data) {
      programaActual = mapProgramaFromDb(data);
      mostrarToast("Semana cargada.", "success");
    } else {
      programaActual = programaVacio(domingo);
      programaActual.items.push(salidaVacia(0));
      mostrarToast("Semana nueva. Completá las filas o usá la anterior.", "success");
    }

    renderEditorSalidas();
  } catch (err) {
    mostrarToast("Error al cargar: " + err.message + " (¿corriste el SQL de salidas?)", "error");
  }
}

async function cargarDesdeSemanaAnterior() {
  const domingo = document.getElementById("salidasDomingo").value;
  if (!domingo) {
    mostrarToast("Seleccioná primero el domingo de la semana nueva.", "error");
    return;
  }

  const domingoAnterior = sumarDiasISO(domingo, -7);

  try {
    const { data, error } = await db
      .from("salidas_programa")
      .select("*, salidas_item(*)")
      .eq("domingo", domingoAnterior)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      mostrarToast("No hay programa guardado para la semana anterior.", "error");
      return;
    }

    const base = mapProgramaFromDb(data);
    programaActual = {
      id: null,
      domingo,
      recordatorio_desde: sumarDiasISO(domingo, 1),
      recordatorio_hasta: sumarDiasISO(domingo, 7),
      recordatorio_grupo: base.recordatorio_grupo || 1,
      items: base.items.map((item) => ({
        ...item,
        uid: nuevoUid(),
        id: undefined
      }))
    };

    // Si ya existía la semana destino, conservar su id para overwrite al guardar
    const { data: existente } = await db
      .from("salidas_programa")
      .select("id")
      .eq("domingo", domingo)
      .maybeSingle();

    if (existente) programaActual.id = existente.id;

    renderEditorSalidas();
    mostrarToast("Semana anterior copiada. Revisá y guardá.", "success");
  } catch (err) {
    mostrarToast("Error: " + err.message, "error");
  }
}

function mapProgramaFromDb(row) {
  const items = (row.salidas_item || []).map((it) => ({
    uid: nuevoUid(),
    id: it.id,
    dia: it.dia,
    horario: it.horario,
    conductor: it.conductor || "",
    punto_encuentro: it.punto_encuentro || "",
    grupos: it.grupos || [],
    territorios: it.territorios || [],
    manzanas: it.manzanas || []
  }));

  return {
    id: row.id,
    domingo: row.domingo,
    recordatorio_desde: row.recordatorio_desde || sumarDiasISO(row.domingo, 1),
    recordatorio_hasta: row.recordatorio_hasta || sumarDiasISO(row.domingo, 7),
    recordatorio_grupo: row.recordatorio_grupo || 1,
    items: ordenarItems(items)
  };
}

function leerRecordatoriosDelForm() {
  programaActual.recordatorio_desde = document.getElementById("recordatorioDesde").value;
  programaActual.recordatorio_hasta = document.getElementById("recordatorioHasta").value;
  programaActual.recordatorio_grupo = Number(document.getElementById("recordatorioGrupo").value);
}

function sincronizarItemsDesdeDom() {
  if (!programaActual) return;
  const rows = document.querySelectorAll("#tablaSalidas tbody tr.salida-row");
  const items = [];

  rows.forEach((row) => {
    const uid = row.dataset.uid;
    const dia = Number(row.querySelector(".salida-dia").value);
    const horario = row.querySelector(".salida-horario").value;
    const conductor = row.querySelector(".salida-conductor").value.trim();
    const punto = row.querySelector(".salida-punto").value.trim();
    const grupos = [...row.querySelectorAll(".chk-grupo:checked")].map((el) => Number(el.value));
    const territorios = parseTerritoriosTexto(row.querySelector(".salida-territorios").value);
    let manzanas = [];
    if (territorios.length === 1) {
      manzanas = parseManzanasTexto(row.querySelector(".salida-manzanas").value);
    }
    items.push({ uid, dia, horario, conductor, punto_encuentro: punto, grupos, territorios, manzanas });
  });

  programaActual.items = items;
  leerRecordatoriosDelForm();
}

function parseTerritoriosTexto(texto) {
  if (!texto) return [];
  const nums = String(texto)
    .split(/[^0-9]+/)
    .map((x) => Number(x))
    .filter((n) => n >= 1 && n <= 110);
  return [...new Set(nums)].sort((a, b) => a - b);
}

function parseManzanasTexto(texto) {
  if (!texto) return [];
  const letras = String(texto)
    .toUpperCase()
    .split(/[^A-I]+/)
    .filter((x) => MANZANAS.includes(x));
  return [...new Set(letras)].sort();
}

function textoTerritorios(territorios) {
  return (territorios || []).slice().sort((a, b) => a - b).join("-");
}

function textoManzanas(manzanas) {
  return (manzanas || []).slice().sort().join("-");
}

function agregarFilaSalida() {
  if (!programaActual) return;
  sincronizarItemsDesdeDom();
  programaActual.items.push(salidaVacia(0));
  renderEditorSalidas();
  const rows = document.querySelectorAll("#tablaSalidas tbody tr.salida-row");
  const last = rows[rows.length - 1];
  if (last) last.querySelector(".salida-horario")?.focus();
}

function reordenarFilasSalida() {
  if (!programaActual) return;
  sincronizarItemsDesdeDom();
  programaActual.items = ordenarItems(programaActual.items);
  renderEditorSalidas();
  mostrarToast("Filas ordenadas por día, horario y grupo.", "success");
}

async function guardarProgramaSemana() {
  if (!programaActual) return;
  sincronizarItemsDesdeDom();
  programaActual.items = ordenarItems(programaActual.items);

  const payload = {
    domingo: programaActual.domingo,
    recordatorio_desde: programaActual.recordatorio_desde || null,
    recordatorio_hasta: programaActual.recordatorio_hasta || null,
    recordatorio_grupo: programaActual.recordatorio_grupo || null,
    actualizado_en: new Date().toISOString()
  };

  try {
    let programaId = programaActual.id;

    if (programaId) {
      const { error } = await db.from("salidas_programa").update(payload).eq("id", programaId);
      if (error) throw new Error(error.message);
      const { error: delErr } = await db.from("salidas_item").delete().eq("programa_id", programaId);
      if (delErr) throw new Error(delErr.message);
    } else {
      const { data, error } = await db.from("salidas_programa").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      programaId = data.id;
      programaActual.id = programaId;
    }

    if (programaActual.items.length) {
      const rows = programaActual.items.map((it) => ({
        programa_id: programaId,
        dia: it.dia,
        horario: it.horario,
        conductor: it.conductor,
        punto_encuentro: it.punto_encuentro,
        grupos: it.grupos,
        territorios: it.territorios,
        manzanas: it.manzanas
      }));
      const { error: insErr } = await db.from("salidas_item").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

    mostrarToast("Programa guardado.", "success");
    renderEditorSalidas();
  } catch (err) {
    mostrarToast("Error al guardar: " + err.message, "error");
  }
}

function renderEditorSalidas() {
  const editor = document.getElementById("salidasEditor");
  const cont = document.getElementById("salidasDias");
  editor.classList.remove("oculto");

  document.getElementById("recordatorioDesde").value = programaActual.recordatorio_desde || "";
  document.getElementById("recordatorioHasta").value = programaActual.recordatorio_hasta || "";
  document.getElementById("recordatorioGrupo").value = String(programaActual.recordatorio_grupo || 1);

  const optsDia = DIAS_NOMBRE.map((nombre, i) => {
    const fecha = formatearFechaCorta(sumarDiasISO(programaActual.domingo, i));
    return `<option value="${i}">${nombre} ${fecha}</option>`;
  }).join("");

  const optsHorario = HORARIOS.map((h) => `<option value="${h}">${h}</option>`).join("");

  cont.innerHTML = `
    <table class="salidas-excel" id="tablaSalidas">
      <thead>
        <tr>
          <th class="col-dia">Día</th>
          <th class="col-hora">Horario</th>
          <th class="col-cond">Conductor</th>
          <th class="col-punto">Punto de encuentro</th>
          <th class="col-grupo">Grupo</th>
          <th class="col-terr">Territorio</th>
          <th class="col-manz">Manzanas</th>
          <th class="col-acc"></th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;

  const tbody = cont.querySelector("tbody");

  for (let dia = 0; dia < 7; dia++) {
    const delDia = programaActual.items
      .filter((it) => it.dia === dia)
      .slice()
      .sort((a, b) => {
        const h = a.horario.localeCompare(b.horario);
        if (h !== 0) return h;
        const ga = (a.grupos || []).slice().sort((x, y) => x - y).join("-");
        const gb = (b.grupos || []).slice().sort((x, y) => x - y).join("-");
        return ga.localeCompare(gb);
      });

    delDia.forEach((item) => {
      tbody.appendChild(crearFilaSalida(item, optsDia, optsHorario));
    });

    if (REUNIONES[dia]) {
      const tr = document.createElement("tr");
      tr.className = "reunion-row";
      tr.innerHTML = `
        <td colspan="8">
          ${DIAS_NOMBRE[dia]} ${formatearFechaCorta(sumarDiasISO(programaActual.domingo, dia))}
          · ${REUNIONES[dia]} Reunión de Congregación (fijo en la imagen)
        </td>
      `;
      tbody.appendChild(tr);
    }
  }

  habilitarAperturaCalendario();
}

function crearFilaSalida(item, optsDia, optsHorario) {
  const tr = document.createElement("tr");
  tr.className = "salida-row";
  tr.dataset.uid = item.uid;

  const gruposHtml = GRUPOS.map(
    (g) => `
      <label class="chip-inline">
        <input type="checkbox" class="chk-grupo" value="${g}" ${
          item.grupos.includes(g) ? "checked" : ""
        }>
        ${g}
      </label>`
  ).join("");

  tr.innerHTML = `
    <td>
      <select class="salida-dia">${optsDia}</select>
    </td>
    <td>
      <select class="salida-horario">${optsHorario}</select>
    </td>
    <td>
      <input class="salida-conductor" type="text" value="${escapeAttr(item.conductor)}" placeholder="Nombre">
    </td>
    <td>
      <input class="salida-punto" type="text" value="${escapeAttr(item.punto_encuentro)}" placeholder="Lugar">
    </td>
    <td>
      <div class="grupos-cell">
        ${gruposHtml}
        <button type="button" class="btn-link btn-todos-grupos">Todos</button>
      </div>
    </td>
    <td>
      <input class="salida-territorios" type="text" readonly
        value="${escapeAttr(textoTerritorios(item.territorios))}"
        placeholder="Elegir..."
        title="Clic para elegir territorios">
    </td>
    <td>
      <input class="salida-manzanas" type="text" value="${escapeAttr(
        textoManzanas(item.manzanas)
      )}" placeholder="A-B-C" ${item.territorios.length === 1 ? "" : "disabled"}>
    </td>
    <td>
      <button type="button" class="btn-mini btn-peligro salida-eliminar" title="Eliminar">×</button>
    </td>
  `;

  tr.querySelector(".salida-dia").value = String(item.dia);
  tr.querySelector(".salida-horario").value = item.horario || "10:00";

  const syncManzanas = () => {
    const terr = parseTerritoriosTexto(tr.querySelector(".salida-territorios").value);
    const input = tr.querySelector(".salida-manzanas");
    if (terr.length === 1) {
      input.disabled = false;
    } else {
      input.disabled = true;
      input.value = "";
    }
  };

  tr.querySelector(".salida-territorios").addEventListener("click", () => {
    abrirModalTerritorios(tr.querySelector(".salida-territorios"), syncManzanas);
  });

  tr.querySelector(".salida-manzanas").addEventListener("blur", () => {
    const m = parseManzanasTexto(tr.querySelector(".salida-manzanas").value);
    tr.querySelector(".salida-manzanas").value = textoManzanas(m);
  });

  tr.querySelector(".btn-todos-grupos").onclick = () => {
    tr.querySelectorAll(".chk-grupo").forEach((el) => {
      el.checked = true;
    });
  };

  tr.querySelector(".salida-eliminar").onclick = () => {
    sincronizarItemsDesdeDom();
    programaActual.items = programaActual.items.filter((x) => x.uid !== item.uid);
    renderEditorSalidas();
  };

  syncManzanas();
  return tr;
}

let modalTerritorioTarget = null;
let modalTerritorioOnConfirm = null;
let modalTerritorioSeleccion = new Set();
let cacheReporteTerritorios = null;
let cacheRegistrosCampanaModal = null;
let modalTerritorioOpciones = {
  titulo: "Seleccionar territorios",
  modoVista: "tradicional",
  campanaId: ""
};

async function abrirModalTerritorios(inputEl, onConfirm) {
  await abrirModalTerritoriosGenerico({
    inputEl,
    onConfirm,
    seleccionInicial: parseTerritoriosTexto(inputEl.value),
    titulo: "Seleccionar territorios",
    modoVista: "auto"
  });
}

/**
 * Modal reutilizable para elegir territorios (salidas o campañas).
 * modoVista: "tradicional" | "campana" | "auto"
 */
async function abrirModalTerritoriosGenerico({
  inputEl = null,
  onConfirm = null,
  seleccionInicial = [],
  titulo = "Seleccionar territorios",
  modoVista = "tradicional",
  campanaId = ""
} = {}) {
  modalTerritorioTarget = inputEl;
  modalTerritorioOnConfirm = onConfirm;
  modalTerritorioSeleccion = new Set(
    [...seleccionInicial].map(Number).filter((n) => n >= 1 && n <= 110)
  );
  modalTerritorioOpciones = { titulo, modoVista, campanaId };

  const modal = document.getElementById("modalTerritorios");
  const grid = document.getElementById("modalTerritoriosGrid");
  const tituloEl = document.getElementById("modalTerritoriosTitulo");
  if (tituloEl) tituloEl.textContent = titulo;

  grid.innerHTML = "<p class='ayuda'>Cargando territorios...</p>";
  modal.classList.remove("oculto");

  try {
    await rellenarSelectoresCampana();
    const filtro = document.getElementById("filtroCampanaModalTerr");
    if (filtro) {
      if (modoVista === "tradicional") {
        filtro.value = "";
        filtro.disabled = true;
      } else if (modoVista === "campana" && campanaId) {
        filtro.value = String(campanaId);
        filtro.disabled = false;
      } else {
        filtro.disabled = false;
        // auto: respeta selección previa del usuario si existe
      }
      filtro.onchange = () => renderModalTerritoriosGrid();
    }

    const { data, error } = await db
      .from("vw_territorios_reporte")
      .select("*")
      .order("numero_territorio");
    if (error) throw new Error(error.message);
    cacheReporteTerritorios = data || [];

    const regs = await db
      .from("territorios_registro")
      .select("id,numero_territorio,fecha_inicio,fecha_fin");
    if (regs.error) throw new Error(regs.error.message);
    cacheRegistrosCampanaModal = regs.data || [];

    renderModalTerritoriosGrid();
  } catch (err) {
    grid.innerHTML = "";
    mostrarToast("Error al cargar territorios: " + err.message, "error");
    cerrarModalTerritorios();
  }
}

async function renderModalTerritoriosGrid() {
  const grid = document.getElementById("modalTerritoriosGrid");
  grid.innerHTML = "";

  const filtro = document.getElementById("filtroCampanaModalTerr");
  const campanaId = filtro ? filtro.value : "";

  let items = [];

  if (campanaId && typeof listarCampanas === "function") {
    try {
      const campanas = await listarCampanas();
      const campana = campanas.find((c) => String(c.id) === String(campanaId));
      if (campana) {
        const enSalidas =
          typeof territoriosUltimaSemanaSalidas === "function"
            ? (await territoriosUltimaSemanaSalidas()).set
            : typeof territoriosSalidasSemanaActual === "function"
              ? await territoriosSalidasSemanaActual()
              : new Set();
        items = campana.territorios.map((n) => ({
          numero: n,
          info: infoTileCampana(n, cacheRegistrosCampanaModal || [], campana, enSalidas)
        }));
      }
    } catch (_) {
      items = [];
    }
  }

  if (!items.length) {
    items = (cacheReporteTerritorios || []).map((t) => ({
      numero: Number(t.numero_territorio),
      info: infoTileTerritorio(t)
    }));
  }

  items.forEach(({ numero, info }) => {
    const div = document.createElement("div");
    div.className = `territorio ${info.clase}`;
    if (modalTerritorioSeleccion.has(numero)) div.classList.add("tile-selected");
    div.innerHTML = info.texto;
    div.onclick = () => {
      if (modalTerritorioSeleccion.has(numero)) modalTerritorioSeleccion.delete(numero);
      else modalTerritorioSeleccion.add(numero);
      div.classList.toggle("tile-selected", modalTerritorioSeleccion.has(numero));
    };
    grid.appendChild(div);
  });
}

function cerrarModalTerritorios() {
  document.getElementById("modalTerritorios").classList.add("oculto");
  modalTerritorioTarget = null;
  modalTerritorioOnConfirm = null;
  const filtro = document.getElementById("filtroCampanaModalTerr");
  if (filtro) filtro.disabled = false;
}

function confirmarModalTerritorios() {
  const lista = [...modalTerritorioSeleccion].sort((a, b) => a - b);
  if (modalTerritorioTarget) {
    modalTerritorioTarget.value = textoTerritorios(lista);
  }
  if (typeof modalTerritorioOnConfirm === "function") modalTerritorioOnConfirm(lista);
  cerrarModalTerritorios();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const modal = document.getElementById("modalTerritorios");
    if (modal && !modal.classList.contains("oculto")) cerrarModalTerritorios();
  }
});

document.getElementById("modalTerritorios")?.addEventListener("click", (e) => {
  if (e.target.id === "modalTerritorios") cerrarModalTerritorios();
});

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function formatearGrupos(grupos) {
  const g = (grupos || []).slice().sort((a, b) => a - b);
  if (!g.length) return "";
  if (g.length === 5) return "Todos";
  return g.join(" - ");
}

function formatearTerritorios(territorios, manzanas) {
  const t = (territorios || []).slice().sort((a, b) => a - b);
  if (!t.length) return "";
  if (t.length === 1 && manzanas && manzanas.length) {
    return `${t[0]} (${manzanas.slice().sort().join("-")})`;
  }
  return t.join(" - ");
}

function filasParaImagen() {
  const porDia = [];

  for (let dia = 0; dia < 7; dia++) {
    const delDia = programaActual.items
      .filter((it) => it.dia === dia)
      .map((it) => ({
        tipo: "salida",
        dia,
        horario: it.horario,
        conductor: it.conductor,
        punto_encuentro: it.punto_encuentro,
        gruposTxt: formatearGrupos(it.grupos),
        terrTxt: formatearTerritorios(it.territorios, it.manzanas)
      }));

    if (REUNIONES[dia]) {
      delDia.push({
        tipo: "reunion",
        dia,
        horario: REUNIONES[dia],
        conductor: "",
        punto_encuentro: "",
        gruposTxt: "",
        terrTxt: ""
      });
    }

    delDia.sort((a, b) => a.horario.localeCompare(b.horario));
    porDia.push(delDia);
  }

  return porDia;
}

function celdaDiaHtml(dia, fechaDia, rowspan) {
  // min-height garantiza espacio para la fecha aunque haya una sola fila
  const minH = Math.max(58, 30 + rowspan * 34);
  return `<td class="cap-dia" rowspan="${rowspan}">
    <div class="cap-dia-inner" style="min-height:${minH}px">
      <div class="cap-dia-nombre">${DIAS_NOMBRE[dia]}</div>
      <div class="cap-dia-fecha-wrap">
        <div class="cap-dia-fecha">${fechaDia}</div>
      </div>
    </div>
  </td>`;
}

function construirHtmlImagen() {
  const porDia = filasParaImagen();
  let body = "";

  porDia.forEach((filasDia, dia) => {
    const fechaDia = formatearFechaCorta(sumarDiasISO(programaActual.domingo, dia));
    const rowspan = Math.max(filasDia.length, 1);

    if (!filasDia.length) {
      body += `
        <tr>
          ${celdaDiaHtml(dia, fechaDia, 1)}
          <td></td><td></td><td></td><td></td><td></td>
        </tr>`;
      return;
    }

    filasDia.forEach((f, idx) => {
      const diaCell = idx === 0 ? celdaDiaHtml(dia, fechaDia, rowspan) : "";

      if (f.tipo === "reunion") {
        body += `
          <tr>
            ${diaCell}
            <td class="cap-reunion" colspan="5">${f.horario} Reunión de Congregación</td>
          </tr>`;
        return;
      }

      const terr =
        f.terrTxt ||
        (f.punto_encuentro.toLowerCase().includes("zoom") ? "-" : "");

      body += `
        <tr>
          ${diaCell}
          <td>${f.horario}</td>
          <td>${escapeHtml(f.conductor)}</td>
          <td>${escapeHtml(f.punto_encuentro)}</td>
          <td>${escapeHtml(f.gruposTxt)}</td>
          <td>${escapeHtml(terr)}</td>
        </tr>`;
    });
  });

  const limpia = `LIMPIEZA DEL ${formatearFechaCorta(
    programaActual.recordatorio_desde
  )} AL ${formatearFechaCorta(programaActual.recordatorio_hasta)} GRUPO ${
    programaActual.recordatorio_grupo
  }`;

  return `
    <div class="cap-root">
      <div class="cap-title-wrap">
        <div class="cap-title">SALIDAS AL MINISTERIO</div>
        <div class="cap-verse">"Y las buenas noticias del Reino se predicarán en toda la tierra habitada... y entonces vendrá el fin" (Mat 24:14)</div>
      </div>
      <table class="cap-table">
        <thead>
          <tr>
            <th>Día</th>
            <th>Horario</th>
            <th>Conductor</th>
            <th>Punto de Encuentro</th>
            <th>Grupo</th>
            <th>Territorio</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
      <div class="cap-recordatorios-title">RECORDATORIOS</div>
      <div class="cap-recordatorios-body">${limpia}</div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function generarImagenSalidas(modo) {
  if (!programaActual) {
    mostrarToast("Cargá una semana primero.", "error");
    return;
  }
  sincronizarItemsDesdeDom();

  const capture = document.getElementById("salidasCapture");
  capture.innerHTML = construirHtmlImagen();

  try {
    const canvas = await html2canvas(capture.firstElementChild, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      onclone: (_doc, el) => {
        el.querySelectorAll(".cap-table, .cap-table th, .cap-table td, .cap-title-wrap, .cap-recordatorios-title, .cap-recordatorios-body, .cap-dia-nombre").forEach((node) => {
          node.style.borderColor = "#000000";
          node.style.borderStyle = "solid";
          if (node.classList.contains("cap-title-wrap") ||
              node.classList.contains("cap-recordatorios-title") ||
              node.classList.contains("cap-recordatorios-body")) {
            node.style.borderWidth = "0.5px";
            if (!node.classList.contains("cap-title-wrap")) node.style.borderTopWidth = "0";
            if (node.classList.contains("cap-title-wrap")) node.style.borderBottomWidth = "0";
          } else if (node.classList.contains("cap-dia-nombre")) {
            node.style.borderWidth = "0";
            node.style.borderBottomWidth = "0.5px";
          } else if (node.classList.contains("cap-table")) {
            node.style.borderWidth = "0.5px";
          } else {
            node.style.borderWidth = "0.5px";
          }
        });
      }
    });

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("No se pudo generar la imagen.");

    guardarCacheImagenSalidas(blob);

    if (modo === "previsualizar") {
      mostrarPreviewSalidas(blob);
      return;
    }

    if (modo === "compartir") {
      // En iOS/Safari, share() debe llamarse en el mismo gesto del usuario.
      // Tras html2canvas ese gesto ya se perdió: abrimos preview y pedimos un segundo toque.
      mostrarPreviewSalidas(blob);
      mostrarToast("Tocá Compartir en la vista previa para enviarla.", "success");
      return;
    }

    descargarBlobSalidas(blob, ultimoNombreSalidas);
    mostrarToast("Imagen descargada.", "success");
  } catch (err) {
    if (err && err.name === "AbortError") return;
    mostrarToast("Error al generar imagen: " + err.message, "error");
  }
}

let previewSalidasUrl = null;
let ultimoBlobSalidas = null;
let ultimoNombreSalidas = null;

function guardarCacheImagenSalidas(blob) {
  ultimoBlobSalidas = blob;
  ultimoNombreSalidas = `Salidas_${programaActual.domingo}.png`;
}

function descargarBlobSalidas(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre || "Salidas.png";
  a.click();
  URL.revokeObjectURL(url);
}

function descargarImagenSalidasCache() {
  if (!ultimoBlobSalidas) {
    generarImagenSalidas("descargar");
    return;
  }
  descargarBlobSalidas(ultimoBlobSalidas, ultimoNombreSalidas);
  mostrarToast("Imagen descargada.", "success");
}

/**
 * Debe invocarse directo desde un click (sin await previo).
 * iOS bloquea share() si el gesto del usuario ya expiró.
 */
function compartirImagenSalidasCache() {
  if (!ultimoBlobSalidas) {
    mostrarToast("Generá primero la vista previa.", "error");
    return;
  }

  const nombre = ultimoNombreSalidas || "Salidas.png";
  const file = new File([ultimoBlobSalidas], nombre, { type: "image/png" });

  if (typeof navigator.share !== "function") {
    descargarBlobSalidas(ultimoBlobSalidas, nombre);
    mostrarToast("Este navegador no comparte archivos. Se descargó la imagen.", "success");
    return;
  }

  const puedeArchivos =
    typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });

  if (!puedeArchivos) {
    descargarBlobSalidas(ultimoBlobSalidas, nombre);
    mostrarToast("No se pueden compartir archivos aquí. Se descargó la imagen.", "success");
    return;
  }

  // Llamada síncrona al share (sin await antes) para conservar el gesto en iOS
  navigator
    .share({
      files: [file],
      title: "Salidas al ministerio",
      text: "Programa de salidas semanal"
    })
    .then(() => mostrarToast("Listo para compartir.", "success"))
    .catch((err) => {
      if (err && err.name === "AbortError") return;
      descargarBlobSalidas(ultimoBlobSalidas, nombre);
      mostrarToast("No se pudo compartir. Se descargó la imagen.", "success");
    });
}

function mostrarPreviewSalidas(blob) {
  const modal = document.getElementById("modalPreviewSalidas");
  const body = document.getElementById("previewSalidasBody");

  guardarCacheImagenSalidas(blob);
  if (previewSalidasUrl) URL.revokeObjectURL(previewSalidasUrl);
  previewSalidasUrl = URL.createObjectURL(blob);

  body.innerHTML = `<img src="${previewSalidasUrl}" alt="Vista previa del programa de salidas">`;
  modal.classList.remove("oculto");
}

function cerrarPreviewSalidas() {
  document.getElementById("modalPreviewSalidas").classList.add("oculto");
  if (previewSalidasUrl) {
    URL.revokeObjectURL(previewSalidasUrl);
    previewSalidasUrl = null;
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const preview = document.getElementById("modalPreviewSalidas");
  if (preview && !preview.classList.contains("oculto")) cerrarPreviewSalidas();
});

document.getElementById("modalPreviewSalidas")?.addEventListener("click", (e) => {
  if (e.target.id === "modalPreviewSalidas") cerrarPreviewSalidas();
});
