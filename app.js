const SUPABASE_URL = "https://mrzupearuxoadparxglm.supabase.co";
const SUPABASE_KEY = "sb_publishable_gkLrS2xsIfaG5bigc50ltg_rM1LV2ei";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function guardar() {
  const numero = document.getElementById("territorio").value;
  const fechaInicio = document.getElementById("fechaInicio").value;
  const fechaFin = document.getElementById("fechaFin").value;
  const observaciones = document.getElementById("observaciones").value;

  if (!numero || !fechaInicio) {
    mostrarToast("Completá territorio y fecha de inicio.", "error");
    return;
  }

  const { error } = await db
    .from("territorios_registro")
    .insert({
      numero_territorio: Number(numero),
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin || null,
      observaciones: observaciones
    });

  if (error) {
    mostrarToast("Error al guardar: " + error.message, "error");
    return;
  }

  mostrarToast("Registro guardado correctamente.", "success");

  document.getElementById("territorio").value = "";
  document.getElementById("fechaInicio").value = "";
  document.getElementById("fechaFin").value = "";
  document.getElementById("observaciones").value = "";

  cargarReporte();
}

async function cargarReporte() {
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

  data.forEach(t => {
    const div = document.createElement("div");
    div.classList.add("territorio");

    let clase = "";
    let texto = `T${t.numero_territorio}`;

   if (t.estado === "ASIGNADO") {
      clase = "asignado";
      texto += "<br>Asignado";
    
      div.onclick = () => {
        abrirPanelFinalizar(
          t.id_registro_asignado,
          t.numero_territorio,
          t.fecha_asignacion
        );
      };
    } else if (t.estado === "NUNCA_HECHO") {
      clase = "nunca";
      texto += "<br>Nunca";
    } else {
      const dias = t.dias_sin_hacer;

      if (dias <= 20) clase = "verde";
      else if (dias <= 35) clase = "amarillo";
      else if (dias <= 50) clase = "naranja";
      else clase = "rojo";

      texto += `<br>${dias} días`;
    }

    div.classList.add(clase);
    div.innerHTML = texto;

    div.onclick = () => {
      abrirDetalleTerritorio(t.numero_territorio);
    };

    contenedor.appendChild(div);
  });
}

function mostrarToast(mensaje, tipo = "success") {
  const toast = document.getElementById("toast");

  toast.textContent = mensaje;
  toast.className = "";
  toast.classList.add("show", tipo);

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function mostrarVista(vista) {
  document.getElementById("vistaCarga").classList.add("oculto");
  document.getElementById("vistaReporte").classList.add("oculto");

  if (vista === "carga") {
    document.getElementById("vistaCarga").classList.remove("oculto");
  }

  if (vista === "reporte") {
    document.getElementById("vistaReporte").classList.remove("oculto");
    cargarReporte();
  }
}

function cargarComboTerritorios() {
  const select = document.getElementById("territorio");

  for (let i = 1; i <= 110; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = "Territorio " + i;
    select.appendChild(option);
  }
}

function abrirPanelFinalizar(idRegistro, numeroTerritorio) {

  document.getElementById("idRegistroAsignado").value = idRegistro;
  document.getElementById("territorioFinalizar").value =
      "Territorio " + numeroTerritorio;

  document.getElementById("fechaFinFinalizar").value = "";

  document.getElementById("reporte").style.display = "none";

  document.getElementById("panelFinalizar")
      .classList.remove("oculto");

  window.scrollTo({
      top: 0,
      behavior: "smooth"
  });
}

function cerrarPanelFinalizar() {

  document.getElementById("panelFinalizar")
      .classList.add("oculto");

  document.getElementById("reporte").style.display = "grid";
}

async function finalizarTerritorio() {
  const idRegistro = document.getElementById("idRegistroAsignado").value;
  const fechaFin = document.getElementById("fechaFinFinalizar").value;

  if (!fechaFin) {
    mostrarToast("Completá la fecha fin.", "error");
    return;
  }

  const { error } = await db
    .from("territorios_registro")
    .update({
      fecha_fin: fechaFin
    })
    .eq("id", idRegistro);

  if (error) {
    mostrarToast("Error al finalizar: " + error.message, "error");
    return;
  }

  mostrarToast("Territorio finalizado correctamente.", "success");

  cerrarPanelFinalizar();
  cargarReporte();
}

async function abrirDetalleTerritorio(numeroTerritorio) {
  document.getElementById("reporte").style.display = "none";
  document.getElementById("panelFinalizar").classList.add("oculto");
  document.getElementById("panelDetalle").classList.remove("oculto");

  document.getElementById("tituloDetalle").textContent =
    "Detalle Territorio " + numeroTerritorio;

  const { data, error } = await db
    .from("territorios_registro")
    .select("*")
    .eq("numero_territorio", numeroTerritorio)
    .order("fecha_inicio", { ascending: false });

  if (error) {
    mostrarToast("Error al cargar detalle: " + error.message, "error");
    return;
  }

  let html = `
    <div class="tabla-scroll">
      <table class="tabla-detalle">
        <thead>
          <tr>
            <th>Inicio</th>
            <th>Fin</th>
            <th>Día fin</th>
            <th>Obs.</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (data.length === 0) {
    html += `
      <tr>
        <td colspan="4">Sin registros</td>
      </tr>
    `;
  }

  data.forEach(r => {
    const diaFin = r.fecha_fin ? obtenerDiaSemana(r.fecha_fin) : "Asignado";

    html += `
      <tr>
        <td>${formatearFecha(r.fecha_inicio)}</td>
        <td>${r.fecha_fin ? formatearFecha(r.fecha_fin) : "-"}</td>
        <td>${diaFin}</td>
        <td>${r.observaciones || ""}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("detalleTerritorio").innerHTML = html;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cerrarDetalleTerritorio() {
  document.getElementById("panelDetalle").classList.add("oculto");
  document.getElementById("reporte").style.display = "grid";
}

function obtenerDiaSemana(fecha) {
  const partes = fecha.split("-");
  const date = new Date(partes[0], partes[1] - 1, partes[2]);

  const dias = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado"
  ];

  return dias[date.getDay()];
}

function formatearFecha(fecha) {
  const partes = fecha.split("-");
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

cargarComboTerritorios() 
cargarReporte();
