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
      mostrarToast("Semana nueva. Completá las salidas o usá la anterior.", "success");
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
  const cards = document.querySelectorAll(".salida-card");
  const items = [];

  cards.forEach((card) => {
    const uid = card.dataset.uid;
    const dia = Number(card.dataset.dia);
    const horario = card.querySelector(".salida-horario").value;
    const conductor = card.querySelector(".salida-conductor").value.trim();
    const punto = card.querySelector(".salida-punto").value.trim();
    const grupos = [...card.querySelectorAll(".chk-grupo:checked")].map((el) => Number(el.value));
    const territorios = getTerritoriosCard(card);
    let manzanas = [];
    if (territorios.length === 1) {
      manzanas = [...card.querySelectorAll(".chk-manzana:checked")].map((el) => el.value);
    }
    items.push({ uid, dia, horario, conductor, punto_encuentro: punto, grupos, territorios, manzanas });
  });

  programaActual.items = ordenarItems(items);
  leerRecordatoriosDelForm();
}

async function guardarProgramaSemana() {
  if (!programaActual) return;
  sincronizarItemsDesdeDom();

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

  cont.innerHTML = "";

  for (let dia = 0; dia < 7; dia++) {
    const fechaDia = sumarDiasISO(programaActual.domingo, dia);
    const seccion = document.createElement("div");
    seccion.className = "dia-seccion";
    seccion.innerHTML = `
      <div class="dia-seccion-header">
        <strong>${DIAS_NOMBRE[dia]} ${formatearFechaCorta(fechaDia)}</strong>
        <button type="button" class="btn-mini" data-dia="${dia}">+ Agregar salida</button>
      </div>
      <div class="dia-salidas" data-dia-list="${dia}"></div>
      ${
        REUNIONES[dia]
          ? `<div class="reunion-fija">Fijo: ${REUNIONES[dia]} Reunión de Congregación</div>`
          : ""
      }
    `;
    cont.appendChild(seccion);

    seccion.querySelector(".btn-mini").onclick = () => {
      sincronizarItemsDesdeDom();
      programaActual.items.push(salidaVacia(dia));
      programaActual.items = ordenarItems(programaActual.items);
      renderEditorSalidas();
    };
  }

  programaActual.items.forEach((item) => {
    const list = cont.querySelector(`[data-dia-list="${item.dia}"]`);
    if (list) list.appendChild(crearCardSalida(item));
  });

  habilitarAperturaCalendario();
}

function crearCardSalida(item) {
  const card = document.createElement("div");
  card.className = "salida-card";
  card.dataset.uid = item.uid;
  card.dataset.dia = String(item.dia);

  const optsHorario = HORARIOS.map(
    (h) => `<option value="${h}" ${h === item.horario ? "selected" : ""}>${h}</option>`
  ).join("");

  const gruposHtml = GRUPOS.map(
    (g) => `
      <label class="chip">
        <input type="checkbox" class="chk-grupo" value="${g}" ${
          item.grupos.includes(g) ? "checked" : ""
        }>
        ${g}
      </label>`
  ).join("");

  const optsTerr = Array.from({ length: 110 }, (_, i) => i + 1)
    .map((n) => `<option value="${n}">Territorio ${n}</option>`)
    .join("");

  const manzanasHtml = MANZANAS.map(
    (m) => `
      <label class="chip">
        <input type="checkbox" class="chk-manzana" value="${m}" ${
          item.manzanas.includes(m) ? "checked" : ""
        }>
        ${m}
      </label>`
  ).join("");

  card.innerHTML = `
    <div class="salida-card-top">
      <label>Horario
        <select class="salida-horario">${optsHorario}</select>
      </label>
      <button type="button" class="btn-mini btn-peligro salida-eliminar">Eliminar</button>
    </div>
    <label>Conductor
      <input class="salida-conductor" type="text" value="${escapeAttr(item.conductor)}" placeholder="Opcional">
    </label>
    <label>Punto de encuentro
      <input class="salida-punto" type="text" value="${escapeAttr(item.punto_encuentro)}" placeholder="Opcional">
    </label>
    <div class="campo-grupo">
      <div class="campo-grupo-header">
        <span>Grupos</span>
        <button type="button" class="btn-link btn-todos-grupos">Todos</button>
      </div>
      <div class="chips">${gruposHtml}</div>
    </div>
    <div class="campo-grupo">
      <div class="campo-grupo-header"><span>Territorios</span></div>
      <div class="terr-add-row">
        <select class="salida-terr-select">${optsTerr}</select>
        <button type="button" class="btn-mini btn-add-terr">Agregar</button>
      </div>
      <div class="chips terr-seleccionados"></div>
    </div>
    <div class="campo-manzanas ${item.territorios.length === 1 ? "" : "oculto"}">
      <div class="campo-grupo-header"><span>Manzanas</span></div>
      <div class="chips">${manzanasHtml}</div>
    </div>
  `;

  const renderTerrChips = () => {
    const box = card.querySelector(".terr-seleccionados");
    const territorios = getTerritoriosCard(card);
    box.innerHTML = territorios
      .map(
        (n) => `
        <span class="chip chip-selected">
          T${n}
          <button type="button" class="chip-x" data-terr="${n}" aria-label="Quitar">×</button>
          <input type="hidden" class="chk-terr" value="${n}" checked>
        </span>`
      )
      .join("");

    box.querySelectorAll(".chip-x").forEach((btn) => {
      btn.onclick = () => {
        const n = Number(btn.dataset.terr);
        const actuales = getTerritoriosCard(card).filter((x) => x !== n);
        setTerritoriosCard(card, actuales);
        renderTerrChips();
        syncManzanasVisibility();
      };
    });
  };

  const syncManzanasVisibility = () => {
    const selected = getTerritoriosCard(card);
    const box = card.querySelector(".campo-manzanas");
    if (selected.length === 1) box.classList.remove("oculto");
    else {
      box.classList.add("oculto");
      card.querySelectorAll(".chk-manzana").forEach((el) => {
        el.checked = false;
      });
    }
  };

  card.querySelector(".salida-eliminar").onclick = () => {
    sincronizarItemsDesdeDom();
    programaActual.items = programaActual.items.filter((x) => x.uid !== item.uid);
    renderEditorSalidas();
  };

  card.querySelector(".btn-todos-grupos").onclick = () => {
    card.querySelectorAll(".chk-grupo").forEach((el) => {
      el.checked = true;
    });
  };

  card.querySelector(".btn-add-terr").onclick = () => {
    const n = Number(card.querySelector(".salida-terr-select").value);
    const actuales = getTerritoriosCard(card);
    if (!actuales.includes(n)) actuales.push(n);
    setTerritoriosCard(card, actuales.sort((a, b) => a - b));
    renderTerrChips();
    syncManzanasVisibility();
  };

  card.querySelector(".salida-horario").addEventListener("change", () => {
    sincronizarItemsDesdeDom();
    programaActual.items = ordenarItems(programaActual.items);
    renderEditorSalidas();
  });

  // seed territories
  setTerritoriosCard(card, item.territorios.slice());
  renderTerrChips();
  syncManzanasVisibility();

  return card;
}

function getTerritoriosCard(card) {
  if (card._territorios) return card._territorios.slice();
  return [...card.querySelectorAll(".chk-terr")].map((el) => Number(el.value));
}

function setTerritoriosCard(card, lista) {
  card._territorios = lista.slice();
}

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

function construirHtmlImagen() {
  const porDia = filasParaImagen();
  let body = "";

  porDia.forEach((filasDia, dia) => {
    const fechaDia = formatearFechaCorta(sumarDiasISO(programaActual.domingo, dia));
    const rowspan = Math.max(filasDia.length, 1);

    if (!filasDia.length) {
      body += `
        <tr>
          <td class="cap-dia" rowspan="1">
            <div class="cap-dia-nombre">${DIAS_NOMBRE[dia]}</div>
            <div class="cap-dia-fecha">${fechaDia}</div>
          </td>
          <td></td><td></td><td></td><td></td><td></td>
        </tr>`;
      return;
    }

    filasDia.forEach((f, idx) => {
      const diaCell =
        idx === 0
          ? `<td class="cap-dia" rowspan="${rowspan}">
               <div class="cap-dia-nombre">${DIAS_NOMBRE[dia]}</div>
               <div class="cap-dia-fecha">${fechaDia}</div>
             </td>`
          : "";

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
      useCORS: true
    });

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("No se pudo generar la imagen.");

    const nombre = `Salidas_${programaActual.domingo}.png`;

    if (modo === "compartir" && navigator.canShare) {
      const file = new File([blob], nombre, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Salidas al ministerio",
          text: "Programa de salidas semanal"
        });
        mostrarToast("Listo para compartir.", "success");
        return;
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);

    if (modo === "compartir") {
      mostrarToast("Este dispositivo no permite compartir. Se descargó la imagen.", "success");
    } else {
      mostrarToast("Imagen descargada.", "success");
    }
  } catch (err) {
    if (err && err.name === "AbortError") return;
    mostrarToast("Error al generar imagen: " + err.message, "error");
  }
}
