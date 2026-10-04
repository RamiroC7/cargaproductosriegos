// Guarda los productos (con sus fotos) en el navegador, usando IndexedDB.
window.DB = (() => {
  let conexion;

  function abrir() {
    if (!conexion) {
      conexion = new Promise((resolver, rechazar) => {
        const pedido = indexedDB.open('riegos-carga-productos', 1);
        pedido.onupgradeneeded = () => pedido.result.createObjectStore('productos', { keyPath: 'id' });
        pedido.onsuccess = () => resolver(pedido.result);
        pedido.onerror = () => rechazar(pedido.error);
      });
    }
    return conexion;
  }

  async function operar(modo, fn) {
    const db = await abrir();
    return new Promise((resolver, rechazar) => {
      const tx = db.transaction('productos', modo);
      const pedido = fn(tx.objectStore('productos'));
      tx.oncomplete = () => resolver(pedido.result);
      tx.onerror = () => rechazar(tx.error);
    });
  }

  return {
    listar: () => operar('readonly', s => s.getAll()),
    obtener: id => operar('readonly', s => s.get(id)),
    guardar: producto => operar('readwrite', s => s.put(producto)),
    borrar: id => operar('readwrite', s => s.delete(id)),
  };
})();
