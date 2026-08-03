/**
 * Generación del formulario S-13 a partir de la plantilla oficial.
 * Coordenadas medidas sobre S-13_S.pdf (origen pdf-lib: abajo-izquierda).
 */

const S13 = {
  TEMPLATE_URL: "S-13_S.pdf",
  PAGE_H: 842.04,
  TERRITORIOS_TOTAL: 110,
  FILAS_POR_PAGINA: 20,
  MAX_CICLOS: 4,
  ROW_H: 31.32,
  // Baselines en coords PyMuPDF (y crece hacia abajo); se convierten al dibujar.
  NAME_Y0: 157.4,
  DATE_Y0: 172.5,
  TERR_Y0: 163.9,
  YEAR_X: 136,
  YEAR_Y_FITZ: 93,
  TERR_X: 54.5,
  LAST_DATE_X: 102.8,
  NAME_X: [187.4, 294.0, 400.7, 507.5],
  ASIGN_X: [162.1, 268.6, 375.3, 482.1],
  COMPL_X: [215.2, 322.0, 428.7, 535.6],
  NAME_SIZE: 8,
  DATE_SIZE: 7.5,
  TERR_SIZE: 10,
  YEAR_SIZE: 12
};

function anioServicioDeFecha(fechaISO) {
  if (!fechaISO) return null;
  const [y, m] = fechaISO.split("-").map(Number);
  return m >= 9 ? y + 1 : y;
}

function fechaEnAnioServicio(fechaISO, anioServicio) {
  return anioServicioDeFecha(fechaISO) === anioServicio;
}

function registroPerteneceAnio(registro, anioServicio) {
  const fechaClave = registro.fecha_fin || registro.fecha_inicio;
  return fechaEnAnioServicio(fechaClave, anioServicio);
}

function formatearFechaS13(fechaISO) {
  if (!fechaISO) return "";
  const [y, m, d] = fechaISO.split("-");
  return `${Number(d)}/${Number(m)}/${String(y).slice(-2)}`;
}

function fitzYToPdf(fitzBaselineY) {
  return S13.PAGE_H - fitzBaselineY;
}

function centrarTexto(page, font, text, centerX, y, size) {
  if (!text) return;
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: centerX - width / 2,
    y,
    size,
    font,
    color: PDFLib.rgb(0, 0, 0)
  });
}

function truncarAAncho(font, text, size, maxWidth) {
  if (!text) return "";
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;

  let out = text;
  while (out.length > 0 && font.widthOfTextAtSize(out + "...", size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out ? out + "..." : "";
}

/**
 * Arma filas S-13: una por territorio 1..110.
 * Por territorio: últimos 4 registros del año de servicio.
 * ultimaFecha: última fecha_fin anterior al primer registro incluido;
 * si no hay anterior, repite fecha_fin del primer incluido.
 */
function armarFilasS13(registros, anioServicio) {
  const porTerritorio = new Map();

  for (let n = 1; n <= S13.TERRITORIOS_TOTAL; n++) {
    porTerritorio.set(n, []);
  }

  registros.forEach((r) => {
    const lista = porTerritorio.get(Number(r.numero_territorio));
    if (lista) lista.push(r);
  });

  const filas = [];

  for (let n = 1; n <= S13.TERRITORIOS_TOTAL; n++) {
    const todos = porTerritorio.get(n).slice().sort((a, b) => {
      const cmp = String(a.fecha_inicio).localeCompare(String(b.fecha_inicio));
      if (cmp !== 0) return cmp;
      return (a.id || 0) - (b.id || 0);
    });

    const delAnio = todos.filter((r) => registroPerteneceAnio(r, anioServicio));
    const incluidos = delAnio.slice(-S13.MAX_CICLOS);

    let ultimaFecha = "";

    if (incluidos.length > 0) {
      const primero = incluidos[0];
      const idxPrimero = todos.findIndex((r) => r.id === primero.id);
      const anteriores = todos.slice(0, idxPrimero).filter((r) => r.fecha_fin);

      if (anteriores.length > 0) {
        ultimaFecha = anteriores[anteriores.length - 1].fecha_fin;
      } else if (primero.fecha_fin) {
        ultimaFecha = primero.fecha_fin;
      }
    }

    filas.push({
      numero: n,
      ultimaFecha,
      ciclos: incluidos.map((r) => ({
        asignado: (r.observaciones || "").trim(),
        fechaInicio: r.fecha_inicio,
        fechaFin: r.fecha_fin
      }))
    });
  }

  return filas;
}

async function generarPdfS13(registros, anioServicio) {
  const { PDFDocument, StandardFonts } = PDFLib;

  const templateBytes = await fetch(S13.TEMPLATE_URL).then((r) => {
    if (!r.ok) throw new Error("No se pudo cargar la plantilla S-13.");
    return r.arrayBuffer();
  });

  const template = await PDFDocument.load(templateBytes);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const filas = armarFilasS13(registros, anioServicio);
  const paginas = Math.ceil(S13.TERRITORIOS_TOTAL / S13.FILAS_POR_PAGINA);

  for (let p = 0; p < paginas; p++) {
    const [page] = await pdf.copyPages(template, [0]);
    pdf.addPage(page);

    page.drawText(String(anioServicio), {
      x: S13.YEAR_X,
      y: fitzYToPdf(S13.YEAR_Y_FITZ),
      size: S13.YEAR_SIZE,
      font,
      color: PDFLib.rgb(0, 0, 0)
    });

    for (let i = 0; i < S13.FILAS_POR_PAGINA; i++) {
      const idx = p * S13.FILAS_POR_PAGINA + i;
      if (idx >= filas.length) break;

      const fila = filas[idx];
      const nameY = fitzYToPdf(S13.NAME_Y0 + i * S13.ROW_H);
      const dateY = fitzYToPdf(S13.DATE_Y0 + i * S13.ROW_H);
      const terrY = fitzYToPdf(S13.TERR_Y0 + i * S13.ROW_H);

      centrarTexto(page, font, String(fila.numero), S13.TERR_X, terrY, S13.TERR_SIZE);
      centrarTexto(
        page,
        font,
        formatearFechaS13(fila.ultimaFecha),
        S13.LAST_DATE_X,
        terrY,
        S13.DATE_SIZE
      );

      fila.ciclos.forEach((ciclo, c) => {
        const nombre = truncarAAncho(
          font,
          ciclo.asignado.toUpperCase(),
          S13.NAME_SIZE,
          100
        );
        centrarTexto(page, font, nombre, S13.NAME_X[c], nameY, S13.NAME_SIZE);
        centrarTexto(
          page,
          font,
          formatearFechaS13(ciclo.fechaInicio),
          S13.ASIGN_X[c],
          dateY,
          S13.DATE_SIZE
        );
        centrarTexto(
          page,
          font,
          formatearFechaS13(ciclo.fechaFin),
          S13.COMPL_X[c],
          dateY,
          S13.DATE_SIZE
        );
      });
    }
  }

  return pdf.save();
}
