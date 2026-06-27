// pdf_crypt.js — cifratura PDF lato browser con qpdf compilato in WASM.
// Usato per proteggere i cedolini con password (codice fiscale) prima dell'invio.

const QPDF_URL = 'https://cdn.jsdelivr.net/npm/qpdf-wasm-esm-embedded@1.1.1/qpdf.mjs'

let _factoryPromise = null

async function getFactory() {
  if (!_factoryPromise) {
    _factoryPromise = import(QPDF_URL).then(m => m.default)
  }
  return _factoryPromise
}

// Converte Uint8Array → stringa base64 a blocchi (evita overflow dello stack)
export function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// Cifra un PDF (Uint8Array) con AES-256 usando `password` come user+owner password.
// Ritorna il PDF cifrato come Uint8Array.
export async function encryptPdf(bytes, password) {
  const createModule = await getFactory()
  let stderr = ''
  const Module = await createModule({
    noInitialRun: true,
    print:    () => {},
    printErr: (s) => { stderr += s + '\n' },
  })

  const inName = 'in.pdf', outName = 'out.pdf'
  Module.FS.writeFile(inName, bytes)

  let rc = 0
  try {
    // qpdf --encrypt <user> <owner> 256 -- in.pdf out.pdf
    rc = Module.callMain(['--encrypt', password, password, '256', '--', inName, outName])
  } catch (e) {
    // Emscripten può lanciare ExitStatus anche con exit code 0
    if (e && typeof e.status === 'number') rc = e.status
    else throw e
  }

  if (rc !== 0) throw new Error(`qpdf rc=${rc} ${stderr}`.trim())

  const out = Module.FS.readFile(outName)   // Uint8Array
  try { Module.FS.unlink(inName); Module.FS.unlink(outName) } catch {}
  return out
}
