import {Namer} from '@parcel/plugin'
import path from 'path'

/**
 * A service worker's scope is determined by its URL. By default, Parcel places our `src/sw/sw.ts` at `sw/sw.js`,
 * which limits its scope to `sw/`, which doesn't help us. We also can't tell GitHub Pages to send a
 * `Service-Worker-Allowed` header to broaden its scope, so therefore, this Parcel Namer plugin places `sw.js`
 * into the root directory of the output. Note it does not check for name collisions because we know we've only
 * got one file with that name.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register#examples
 * https://parceljs.org/plugin-system/namer/
 * https://parceljs.org/features/plugins/#relative-file-paths
 * */
export default new Namer({
  name({bundle, logger}) {
    const fp = bundle.getMainEntry().filePath
    if ( path.basename(fp) == 'sw.ts' ) {
      logger.log({message: `handling ${fp}`})
      return 'sw.js'
    }
    // Allow the next namer to handle this bundle.
    return null
  }
})