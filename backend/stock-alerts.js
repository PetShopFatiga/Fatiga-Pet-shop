// Extract bag weight from product name (e.g. "BIOPET 20KG" -> 20)
function getBagWeight(nombre) {
  const match = nombre.match(/(\d+(?:[,\.]\d+)?)\s*KG/i);
  if (match) return parseFloat(match[1].replace(',', '.'));
  return null;
}

// Get stock priority level
function getStockPriority(producto) {
  const stock = parseFloat(producto.stock_actual);
  const nombre = producto.nombre || '';
  
  if (producto.vende_por_kg) {
    const pesobolsa = getBagWeight(nombre);
    if (!pesobolsa) return 'ok';
    if (stock <= 0) return 'critico';
    if (stock < pesobolsa) return 'critico';      // menos de 1 bolsa = abrió la última
    if (stock < pesobolsa * 2) return 'alto';     // menos de 2 bolsas
    if (stock < pesobolsa * 3) return 'medio';    // menos de 3 bolsas
    return 'ok';
  } else {
    // unidades
    if (stock <= 0) return 'critico';
    if (stock <= 1) return 'critico';    // se abrió la última
    if (stock <= 1) return 'alto';       // queda 1
    if (stock <= 2) return 'medio';      // quedan 2
    return 'ok';
  }
}

module.exports = { getBagWeight, getStockPriority };
