/**
 * Campañas: períodos donde se busca trabajar un conjunto de territorios.
 */

let cacheCampanas = null;
let campanaEditorTerritorios = new Set();

function etiquetaCampana(c) {
  const nombre = (c.nombre || "").trim();
  const rango = `${formatearFecha(c.fecha_inicio)} - ${formatearFecha(c.fecha_fin)}`;
  return nombre ? `${nombre} (${rango})` : rango;
}

async function listarCampanas(forzar = false) {
  if (cacheCampanas && !forzar) return cacheCampanas;

  const { data, error } = await db
    .from("campanas")
    .select("*, campana_territorios(numero_territorio)")
    .order("fecha_inicio", { ascending: false });

  if (error) throw new Error(error.message);

  cacheCampanas = (data || []).map((c) => ({
    ...c,
    territorios: (c.campana_territorios || [])
      .map((t) => Number(t.numero_territorio))
      .sort((a, b) => a - b)
  }));

  return cacheCampanas;
}

function invalidarCacheCampanas() {
  cacheCampanas = null;
}

/**
 * Estado de un territorio dentro de una campaña:
 * - verde: completado (fecha_fin) dentro del rango de la campaña
 * - amarillo: aparece en el programa de salidas de esta semana
 * - rojo: pendiente
 */
function infoTileCampana(numero, registros, campana, territoriosEnSalidasSemana) {
  const delTerr = (registros || []).filter(
    (r) => Number(r.numero_territorio) === Number(numero)
  );
  const n = Number(numero);

  const completado = delTerr.some(
    (r) =>
      r.fecha_fin &&
      r.fecha_fin >= campana.fecha_inicio &&
      r.fecha_fin <= campana.fecha_fin
  );

  if (completado) {
    return { clase: "verde", texto: `T${n}<br>Hecho` };
  }

  if (territoriosEnSalidasSemana && territoriosEnSalidasSemana.has(n)) {
    return { clase: "amarillo", texto: `T${n}<br>En salidas` };
  }

  return { clase: "rojo", texto: `T${n}<br>Pendiente` };
}

async function territoriosSalidasSemanaActual() {
  const domingo = typeof domingoDe === "function"
    ? domingoDe(new Date())
    : null;

  if (!domingo) return new Set();

  const { data: programa, error } = await db
    .from("salidas_programa")
    .select("id")
    .eq("domingo", domingo)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!programa) return new Set();

  const { data: items, error: itemsErr } = await db
    .from("salidas_item")
    .select("territorios")
    .eq("programa_id", programa.id);

  if (itemsErr) throw new Error(itemsErr.message);

  const set = new Set();
  (items || []).forEach((it) => {
    (it.territorios || []).forEach((t) => set.add(Number(t)));
  });
  return set;
}

async function cargarRegistrosParaCampana() {
  const { data, error } = await db
    .from("territorios_registro")
    .select("id,numero_territorio,fecha_inicio,fecha_fin")
    .order("numero_territorio")
    .order("fecha_inicio");

  if (error) throw new Error(error.message);
  return data || [];
}

async function prepararVistaCampanas() {
  await renderListaCampanas();
  resetFormCampana();
  habilitarAperturaCalendario();
}

function resetFormCampana() {
  document.getElementById("campanaId").value = "";
  document.getElementById("campanaNombre").value = "";
  document.getElementById("campanaInicio").value = "";
  document.getElementById("campanaFin").value = "";
  campanaEditorTerritorios = new Set();
  renderCampanaTerritoriosSeleccion();
  document.getElementById("btnGuardarCampana").textContent = "Crear campaña";
  document.getElementById("btnCancelarEdicionCampana").classList.add("oculto");
}

async function renderListaCampanas() {
  const cont = document.getElementById("listaCampanas");
  cont.innerHTML = "<p class='ayuda'>Cargando campañas...</p>";

  try {
    const campanas = await listarCampanas(true);
    if (!campanas.length) {
      cont.innerHTML = "<p class='ayuda'>Todavía no hay campañas creadas.</p>";
      return;
    }

    cont.innerHTML = campanas
      .map((c) => {
        const cant = c.territorios.length;
        return `
          <div class="campana-item" data-id="${c.id}">
            <div>
              <strong>${escapeHtmlCampana(etiquetaCampana(c))}</strong>
              <div class="ayuda ayuda-compacta">${cant} territorio${cant === 1 ? "" : "s"}</div>
            </div>
            <div class="campana-item-acciones">
              <button type="button" class="btn-mini" data-accion="editar">Editar</button>
              <button type="button" class="btn-mini btn-peligro" data-accion="borrar">Borrar</button>
            </div>
          </div>`;
      })
      .join("");

    cont.querySelectorAll(".campana-item").forEach((item) => {
      const id = Number(item.dataset.id);
      item.querySelector('[data-accion="editar"]').onclick = () => editarCampana(id);
      item.querySelector('[data-accion="borrar"]').onclick = () => borrarCampana(id);
    });
  } catch (err) {
    cont.innerHTML = "";
    mostrarToast("Error al cargar campañas: " + err.message + " (¿corriste supabase-campanas.sql?)", "error");
  }
}

function escapeHtmlCampana(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function editarCampana(id) {
  try {
    const campanas = await listarCampanas();
    const c = campanas.find((x) => x.id === id);
    if (!c) return;

    document.getElementById("campanaId").value = String(c.id);
    document.getElementById("campanaNombre").value = c.nombre || "";
    document.getElementById("campanaInicio").value = c.fecha_inicio;
    document.getElementById("campanaFin").value = c.fecha_fin;
    campanaEditorTerritorios = new Set(c.territorios);
    renderCampanaTerritoriosSeleccion();
    document.getElementById("btnGuardarCampana").textContent = "Guardar cambios";
    document.getElementById("btnCancelarEdicionCampana").classList.remove("oculto");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    mostrarToast("Error: " + err.message, "error");
  }
}

async function borrarCampana(id) {
  if (!confirm("¿Borrar esta campaña?")) return;

  try {
    const { error } = await db.from("campanas").delete().eq("id", id);
    if (error) throw new Error(error.message);
    invalidarCacheCampanas();
    await renderListaCampanas();
    await rellenarSelectoresCampana();
    resetFormCampana();
    mostrarToast("Campaña eliminada.", "success");
  } catch (err) {
    mostrarToast("Error al borrar: " + err.message, "error");
  }
}

function renderCampanaTerritoriosSeleccion() {
  const box = document.getElementById("campanaTerritoriosChips");
  const lista = [...campanaEditorTerritorios].sort((a, b) => a - b);
  document.getElementById("campanaTerrCount").textContent = String(lista.length);

  if (!lista.length) {
    box.innerHTML = "<span class='ayuda'>Ningún territorio seleccionado.</span>";
    return;
  }

  box.innerHTML = lista
    .map(
      (n) => `
      <span class="chip chip-selected">
        T${n}
        <button type="button" class="chip-x" data-terr="${n}" aria-label="Quitar">×</button>
      </span>`
    )
    .join("");

  box.querySelectorAll(".chip-x").forEach((btn) => {
    btn.onclick = () => {
      campanaEditorTerritorios.delete(Number(btn.dataset.terr));
      renderCampanaTerritoriosSeleccion();
    };
  });
}

function abrirModalTerritoriosCampana() {
  abrirModalTerritoriosGenerico({
    seleccionInicial: campanaEditorTerritorios,
    onConfirm: (lista) => {
      campanaEditorTerritorios = new Set(lista);
      renderCampanaTerritoriosSeleccion();
    },
    titulo: "Territorios de la campaña",
    modoVista: "tradicional"
  });
}

async function guardarCampana() {
  const id = document.getElementById("campanaId").value;
  const nombre = document.getElementById("campanaNombre").value.trim();
  const fechaInicio = document.getElementById("campanaInicio").value;
  const fechaFin = document.getElementById("campanaFin").value;
  const territorios = [...campanaEditorTerritorios].sort((a, b) => a - b);

  if (!fechaInicio || !fechaFin) {
    mostrarToast("Completá fecha de inicio y fin.", "error");
    return;
  }
  if (fechaFin < fechaInicio) {
    mostrarToast("La fecha fin no puede ser anterior al inicio.", "error");
    return;
  }
  if (!territorios.length) {
    mostrarToast("Seleccioná al menos un territorio.", "error");
    return;
  }

  const nombreFinal =
    nombre || `Campaña ${formatearFecha(fechaInicio)} - ${formatearFecha(fechaFin)}`;

  try {
    let campanaId = id ? Number(id) : null;

    if (campanaId) {
      const { error } = await db
        .from("campanas")
        .update({
          nombre: nombreFinal,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          actualizado_en: new Date().toISOString()
        })
        .eq("id", campanaId);
      if (error) throw new Error(error.message);

      const { error: delErr } = await db
        .from("campana_territorios")
        .delete()
        .eq("campana_id", campanaId);
      if (delErr) throw new Error(delErr.message);
    } else {
      const { data, error } = await db
        .from("campanas")
        .insert({
          nombre: nombreFinal,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      campanaId = data.id;
    }

    const rows = territorios.map((n) => ({
      campana_id: campanaId,
      numero_territorio: n
    }));
    const { error: insErr } = await db.from("campana_territorios").insert(rows);
    if (insErr) throw new Error(insErr.message);

    invalidarCacheCampanas();
    await renderListaCampanas();
    await rellenarSelectoresCampana();
    resetFormCampana();
    mostrarToast(id ? "Campaña actualizada." : "Campaña creada.", "success");
  } catch (err) {
    mostrarToast("Error al guardar: " + err.message, "error");
  }
}

async function rellenarSelectoresCampana() {
  let campanas = [];
  try {
    campanas = await listarCampanas();
  } catch (_) {
    campanas = [];
  }

  const selects = [
    document.getElementById("filtroCampanaReporte"),
    document.getElementById("filtroCampanaModalTerr")
  ].filter(Boolean);

  selects.forEach((select) => {
    const actual = select.value;
    const esModal = select.id === "filtroCampanaModalTerr";
    select.innerHTML = esModal
      ? `<option value="">Vista tradicional (días)</option>`
      : `<option value="">Sin campaña (vista normal)</option>`;

    campanas.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = String(c.id);
      opt.textContent = etiquetaCampana(c);
      select.appendChild(opt);
    });

    if ([...select.options].some((o) => o.value === actual)) {
      select.value = actual;
    }
  });
}

async function cargarReporteConCampana() {
  const filtro = document.getElementById("filtroCampanaReporte");
  const campanaId = filtro ? filtro.value : "";

  if (!campanaId) {
    await cargarReporteNormal();
    return;
  }

  try {
    const campanas = await listarCampanas();
    const campana = campanas.find((c) => String(c.id) === String(campanaId));
    if (!campana) {
      mostrarToast("No se encontró la campaña.", "error");
      return;
    }

    const registros = await cargarRegistrosParaCampana();
    const enSalidas = await territoriosSalidasSemanaActual();
    const reporteBase = await db
      .from("vw_territorios_reporte")
      .select("*")
      .order("numero_territorio");

    if (reporteBase.error) throw new Error(reporteBase.error.message);

    const porNumero = new Map(
      (reporteBase.data || []).map((t) => [Number(t.numero_territorio), t])
    );

    const contenedor = document.getElementById("reporte");
    contenedor.innerHTML = "";

    const leyenda = document.getElementById("leyendaCampanaReporte");
    if (leyenda) {
      leyenda.classList.remove("oculto");
      leyenda.innerHTML = `
        <span class="leyenda-item"><i class="swatch verde"></i> Completado en campaña</span>
        <span class="leyenda-item"><i class="swatch amarillo"></i> En salidas de esta semana</span>
        <span class="leyenda-item"><i class="swatch rojo"></i> Pendiente</span>
      `;
    }

    campana.territorios.forEach((n) => {
      const info = infoTileCampana(n, registros, campana, enSalidas);
      const base = porNumero.get(n);
      const div = document.createElement("div");
      div.classList.add("territorio", info.clase);
      div.innerHTML = info.texto;

      if (base && base.estado === "ASIGNADO") {
        div.onclick = () => {
          abrirPanelFinalizar(
            base.id_registro_asignado,
            base.numero_territorio,
            base.fecha_asignacion
          );
        };
      } else {
        div.onclick = () => abrirDetalleTerritorio(n);
      }

      contenedor.appendChild(div);
    });
  } catch (err) {
    mostrarToast("Error al cargar reporte de campaña: " + err.message, "error");
  }
}

async function cargarReporteNormal() {
  const leyenda = document.getElementById("leyendaCampanaReporte");
  if (leyenda) {
    leyenda.classList.add("oculto");
    leyenda.innerHTML = "";
  }

  const { data, error } = await db
    .from("vw_territorios_reporte")
    .select("*")
    .order("numero_territorio");

  if (error) {
    mostrarToast("Error al cargar reporte: " + error.message, "error");
    return;
  }

  const contenedor = document.getElementById("reporte");
  contenedor.innerHTML = "";

  data.forEach((t) => {
    const div = document.createElement("div");
    const info = infoTileTerritorio(t);
    div.classList.add("territorio", info.clase);
    div.innerHTML = info.texto;

    if (t.estado === "ASIGNADO") {
      div.onclick = () => {
        abrirPanelFinalizar(
          t.id_registro_asignado,
          t.numero_territorio,
          t.fecha_asignacion
        );
      };
    } else {
      div.onclick = () => abrirDetalleTerritorio(t.numero_territorio);
    }

    contenedor.appendChild(div);
  });
}
