const SUPABASE_URL = "db.mrzupearuxoadparxglm.supabase.co";
const SUPABASE_KEY = "sb_publishable_gkLrS2xsIfaG5bigc50ltg_rM1LV2ei";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function guardar() {
  const numero = document.getElementById("territorio").value;
  const fechaInicio = document.getElementById("fechaInicio").value;
  const fechaFin = document.getElementById("fechaFin").value;
  const observaciones = document.getElementById("observaciones").value;

  if (!numero || !fechaInicio) {
    alert("Completá territorio y fecha de inicio.");
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
    alert("Error al guardar: " + error.message);
    return;
  }

  alert("Registro guardado correctamente.");

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
    alert("Error al cargar reporte: " + error.message);
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
    } else if (t.estado === "NUNCA_HECHO") {
      clase = "nunca";
      texto += "<br>Nunca";
    } else {
      const dias = t.dias_sin_hacer;

      if (dias <= 30) clase = "verde";
      else if (dias <= 90) clase = "amarillo";
      else if (dias <= 180) clase = "naranja";
      else clase = "rojo";

      texto += `<br>${dias} días`;
    }

    div.classList.add(clase);
    div.innerHTML = texto;

    contenedor.appendChild(div);
  });
}

cargarReporte();
