commit 29fd7aadf947639f86ce0de7f381a62b52bd32b4
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sun Jan 18 15:49:50 2026 +0800

    Support pre-rendering next pages for PDFs
---
 fixed-layout.js | 258 +++++++++++++++++++++++++++++++++++++++++++++++++++-----
 pdf.js          |   8 +-
 2 files changed, 241 insertions(+), 25 deletions(-)

diff --git a/fixed-layout.js b/fixed-layout.js
index fd5e0b9..48519fe 100644
--- a/fixed-layout.js
+++ b/fixed-layout.js
@@ -46,9 +46,18 @@ export class FixedLayout extends HTMLElement {
     #side
     #zoom
     #scaleFactor = 1.0
+    #totalScaleFactor = 1.0
     #scrollLocked = false
     #isOverflowX = false
     #isOverflowY = false
+    #preloadCache = new Map()
+    #prerenderedSpreads = new Map()
+    #spreadAccessTime = new Map()
+    #maxConcurrentPreloads = 1
+    #numPrerenderedSpreads = 1
+    #maxCachedSpreads = 2
+    #preloadQueue = []
+    #activePreloads = 0
     constructor() {
         super()
 
@@ -86,7 +95,7 @@ export class FixedLayout extends HTMLElement {
                 break
         }
     }
-    async #createFrame({ index, src: srcOption }) {
+    async #createFrame({ index, src: srcOption, detached = false }) {
         const srcOptionIsString = typeof srcOption === 'string'
         const src = srcOptionIsString ? srcOption : srcOption?.src
         const data = srcOptionIsString ? null : srcOption?.data
@@ -106,6 +115,15 @@ export class FixedLayout extends HTMLElement {
         iframe.setAttribute('scrolling', 'no')
         iframe.setAttribute('part', 'filter')
         this.#root.append(element)
+
+        if (detached) {
+            Object.assign(element.style, {
+                position: 'absolute',
+                visibility: 'hidden',
+                pointerEvents: 'none',
+            })
+        }
+
         if (!src) return { blank: true, element, iframe }
         return new Promise(resolve => {
             iframe.addEventListener('load', () => {
@@ -117,6 +135,7 @@ export class FixedLayout extends HTMLElement {
                     width: parseFloat(width),
                     height: parseFloat(height),
                     onZoom,
+                    detached,
                 })
             }, { once: true })
             if (data) {
@@ -155,7 +174,9 @@ export class FixedLayout extends HTMLElement {
                             left.height ?? blankHeight,
                             right.height ?? blankHeight)))
             ) || 1
+
         scale *= this.#scaleFactor
+        this.#totalScaleFactor = scale
 
         const transform = ({frame, styles}) => {
             let { element, iframe, width, height, blank, onZoom } = frame
@@ -210,22 +231,54 @@ export class FixedLayout extends HTMLElement {
             this.#isOverflowY = Math.max(leftHeight, rightHeight) > containerHeight
         }
     }
-    async #showSpread({ left, right, center, side }) {
-        this.#root.replaceChildren()
+    async #showSpread({ left, right, center, side, spreadIndex }) {
         this.#left = null
         this.#right = null
         this.#center = null
-        if (center) {
-            this.#center = await this.#createFrame(center)
-            this.#side = 'center'
-            this.#render()
+
+        const cacheKey = spreadIndex !== undefined ? `spread-${spreadIndex}` : null
+        const prerendered = cacheKey ? this.#prerenderedSpreads.get(cacheKey) : null
+
+        if (prerendered) {
+            this.#spreadAccessTime.set(cacheKey, Date.now())
+            if (prerendered.center) {
+                this.#center = prerendered.center
+            } else {
+                this.#left = prerendered.left
+                this.#right = prerendered.right
+            }
         } else {
-            this.#left = await this.#createFrame(left)
-            this.#right = await this.#createFrame(right)
-            this.#side = this.#left.blank ? 'right'
-                : this.#right.blank ? 'left' : side
-            this.#render()
+            if (center) {
+                this.#center = await this.#createFrame(center)
+                if (cacheKey) {
+                    this.#prerenderedSpreads.set(cacheKey, { center: this.#center })
+                    this.#spreadAccessTime.set(cacheKey, Date.now())
+                }
+            } else {
+                this.#left = await this.#createFrame(left)
+                this.#right = await this.#createFrame(right)
+                if (cacheKey) {
+                    this.#prerenderedSpreads.set(cacheKey, { left: this.#left, right: this.#right })
+                    this.#spreadAccessTime.set(cacheKey, Date.now())
+                }
+            }
         }
+
+        this.#side = center ? 'center' : this.#left.blank ? 'right'
+            : this.#right.blank ? 'left' : side
+        const visibleFrames = center
+            ? [this.#center?.element]
+            : [this.#left?.element, this.#right?.element]
+
+        Array.from(this.#root.children).forEach(child => {
+            const isVisible = visibleFrames.includes(child)
+            Object.assign(child.style, {
+                position: isVisible ? 'relative' : 'absolute',
+                visibility: isVisible ? 'visible' : 'hidden',
+                pointerEvents: isVisible ? 'auto' : 'none',
+            })
+        })
+        this.#render()
     }
     #goLeft() {
         if (this.#center || this.#left?.blank) return
@@ -300,6 +353,17 @@ export class FixedLayout extends HTMLElement {
         this.#spread(spreadMode)
         const { index } = this.getSpreadOf(section)
         this.#index = -1
+        this.#preloadCache.clear()
+        for (const frames of this.#prerenderedSpreads.values()) {
+            if (frames.center) {
+                frames.center.element?.remove()
+            } else {
+                frames.left?.element?.remove()
+                frames.right?.element?.remove()
+            }
+        }
+        this.#prerenderedSpreads.clear()
+        this.#spreadAccessTime.clear()
         this.goToSpread(index, this.rtl ? 'right' : 'left', 'page')
     }
     get index() {
@@ -341,20 +405,157 @@ export class FixedLayout extends HTMLElement {
         }
         this.#index = index
         const spread = this.#spreads[index]
-        if (spread.center) {
-            const index = this.book.sections.indexOf(spread.center)
-            const src = await spread.center?.load?.()
-            await this.#showSpread({ center: { index, src } })
+        const cacheKey = `spread-${index}`
+        const cached = this.#preloadCache.get(cacheKey)
+        if (cached && cached !== 'loading') {
+            if (cached.center) {
+                const sectionIndex = this.book.sections.indexOf(spread.center)
+                await this.#showSpread({ center: { index: sectionIndex, src: cached.center }, spreadIndex: index, side })
+            } else {
+                const indexL = this.book.sections.indexOf(spread.left)
+                const indexR = this.book.sections.indexOf(spread.right)
+                const left = { index: indexL, src: cached.left }
+                const right = { index: indexR, src: cached.right }
+                await this.#showSpread({ left, right, side, spreadIndex: index })
+            }
         } else {
-            const indexL = this.book.sections.indexOf(spread.left)
-            const indexR = this.book.sections.indexOf(spread.right)
-            const srcL = await spread.left?.load?.()
-            const srcR = await spread.right?.load?.()
-            const left = { index: indexL, src: srcL }
-            const right = { index: indexR, src: srcR }
-            await this.#showSpread({ left, right, side })
+            if (spread.center) {
+                const sectionIndex = this.book.sections.indexOf(spread.center)
+                const src = await spread.center?.load?.()
+                await this.#showSpread({ center: { index: sectionIndex, src }, spreadIndex: index, side })
+            } else {
+                const indexL = this.book.sections.indexOf(spread.left)
+                const indexR = this.book.sections.indexOf(spread.right)
+                const srcL = await spread.left?.load?.()
+                const srcR = await spread.right?.load?.()
+                const left = { index: indexL, src: srcL }
+                const right = { index: indexR, src: srcR }
+                await this.#showSpread({ left, right, side, spreadIndex: index })
+            }
         }
+
         this.#reportLocation(reason)
+        this.#preloadNextSpreads()
+    }
+    #preloadNextSpreads() {
+        this.#cleanupPreloadCache()
+
+        if (this.#numPrerenderedSpreads <= 0) return
+
+        const toPreload = []
+        const forwardPreloadCount = Math.max(1, this.#numPrerenderedSpreads - 1)
+        const backwardPreloadCount = Math.max(0, this.#numPrerenderedSpreads - forwardPreloadCount)
+        for (let distance = 1; distance <= forwardPreloadCount; distance++) {
+            const forwardIndex = this.#index + distance
+            if (forwardIndex >= 0 && forwardIndex < this.#spreads.length) {
+                toPreload.push({ index: forwardIndex, direction: 'forward', distance })
+            }
+        }
+        for (let distance = 1; distance <= backwardPreloadCount; distance++) {
+            const backwardIndex = this.#index - distance
+            if (backwardIndex >= 0 && backwardIndex < this.#spreads.length) {
+                toPreload.push({ index: backwardIndex, direction: 'backward', distance })
+            }
+        }
+        for (const { index: targetIndex, direction } of toPreload) {
+            const cacheKey = `spread-${targetIndex}`
+            if (this.#prerenderedSpreads.has(cacheKey)) continue
+            const spread = this.#spreads[targetIndex]
+            if (!spread) continue
+            this.#preloadQueue.push({ targetIndex, direction, spread, cacheKey })
+        }
+
+        this.#processPreloadQueue()
+    }
+
+    async #processPreloadQueue() {
+        while (this.#preloadQueue.length > 0 && this.#activePreloads < this.#maxConcurrentPreloads) {
+            const task = this.#preloadQueue.shift()
+            if (!task) break
+
+            const { spread, cacheKey } = task
+            this.#preloadCache.set(cacheKey, 'loading')
+            this.#activePreloads++
+            Promise.resolve().then(async () => {
+                try {
+                    if (spread.center) {
+                        const src = await spread.center?.load?.()
+                        this.#preloadCache.set(cacheKey, { center: src })
+
+                        const sectionIndex = this.book.sections.indexOf(spread.center)
+                        const frame = await this.#createFrame({ index: sectionIndex, src, detached: true })
+
+                        this.#prerenderedSpreads.set(cacheKey, { center: frame })
+                        this.#spreadAccessTime.set(cacheKey, Date.now())
+                        if (frame.onZoom) {
+                            const doc = frame.iframe.contentDocument
+                            frame.onZoom({ doc, scale: this.#totalScaleFactor })
+                        }
+                    } else {
+                        const srcL = await spread.left?.load?.()
+                        const srcR = await spread.right?.load?.()
+                        this.#preloadCache.set(cacheKey, { left: srcL, right: srcR })
+
+                        const indexL = this.book.sections.indexOf(spread.left)
+                        const indexR = this.book.sections.indexOf(spread.right)
+                        const leftFrame = await this.#createFrame({ index: indexL, src: srcL, detached: true })
+                        const rightFrame = await this.#createFrame({ index: indexR, src: srcR, detached: true })
+
+                        this.#prerenderedSpreads.set(cacheKey, { left: leftFrame, right: rightFrame })
+                        this.#spreadAccessTime.set(cacheKey, Date.now())
+
+                        if (leftFrame.onZoom) {
+                            const docL = leftFrame.iframe.contentDocument
+                            leftFrame.onZoom({ doc: docL, scale: this.#totalScaleFactor })
+                        }
+                        if (rightFrame.onZoom) {
+                            const docR = rightFrame.iframe.contentDocument
+                            rightFrame.onZoom({ doc: docR, scale: this.#totalScaleFactor })
+                        }
+                    }
+                } catch {
+                    this.#preloadCache.delete(cacheKey)
+                    this.#prerenderedSpreads.delete(cacheKey)
+                } finally {
+                    this.#activePreloads--
+                    this.#processPreloadQueue()
+                }
+            })
+        }
+    }
+    #cleanupPreloadCache() {
+        const maxSpreads = this.#maxCachedSpreads
+        if (this.#prerenderedSpreads.size <= maxSpreads) {
+            return
+        }
+
+        const framesByAge = Array.from(this.#prerenderedSpreads.keys())
+            .map(key => ({
+                key,
+                accessTime: this.#spreadAccessTime.get(key) || 0,
+            }))
+            .sort((a, b) => a.accessTime - b.accessTime)
+
+        const numToRemove = this.#prerenderedSpreads.size - maxSpreads
+        const framesToDelete = framesByAge.slice(0, numToRemove).map(item => item.key)
+
+        if (framesToDelete.length > 0) {
+            framesToDelete.forEach(key => {
+                const frames = this.#prerenderedSpreads.get(key)
+                if (frames) {
+                    if (frames.center) {
+                        frames.center.element?.remove()
+                    } else {
+                        frames.left?.element?.remove()
+                        frames.right?.element?.remove()
+                    }
+                }
+
+                this.#prerenderedSpreads.delete(key)
+                this.#spreadAccessTime.delete(key)
+                this.#preloadCache.delete(key)
+            })
+        }
     }
     async select(target) {
         await this.goTo(target)
@@ -400,6 +601,17 @@ export class FixedLayout extends HTMLElement {
     }
     destroy() {
         this.#observer.unobserve(this)
+        for (const frames of this.#prerenderedSpreads.values()) {
+            if (frames.center) {
+                frames.center.element?.remove()
+            } else {
+                frames.left?.element?.remove()
+                frames.right?.element?.remove()
+            }
+        }
+        this.#prerenderedSpreads.clear()
+        this.#preloadCache.clear()
+        this.#spreadAccessTime.clear()
     }
 }
 
diff --git a/pdf.js b/pdf.js
index 0ccd2f0..b7c08c8 100644
--- a/pdf.js
+++ b/pdf.js
@@ -15,7 +15,9 @@ const render = async (page, doc, zoom) => {
     doc.documentElement.style.transform = `scale(${1 / devicePixelRatio})`
     doc.documentElement.style.transformOrigin = 'top left'
     doc.documentElement.style.setProperty('--total-scale-factor', scale)
+    doc.documentElement.style.setProperty('--user-unit', '1')
     doc.documentElement.style.setProperty('--scale-round-x', '1px')
+    doc.documentElement.style.setProperty('--scale-round-y', '1px')
     const viewport = page.getViewport({ scale })
 
     // the canvas must be in the `PDFDocument`'s `ownerDocument`
@@ -25,7 +27,9 @@ const render = async (page, doc, zoom) => {
     canvas.width = viewport.width
     const canvasContext = canvas.getContext('2d')
     await page.render({ canvasContext, viewport }).promise
-    doc.querySelector('#canvas').replaceChildren(doc.adoptNode(canvas))
+    const canvasElement = doc.querySelector('#canvas')
+    if (!canvasElement) return
+    canvasElement.replaceChildren(doc.adoptNode(canvas))
 
     const container = doc.querySelector('.textLayer')
     const textLayer = new pdfjsLib.TextLayer({
@@ -34,7 +38,7 @@ const render = async (page, doc, zoom) => {
     })
     await textLayer.render()
 
-    // hide "offscreen" canvases appended to docuemnt when rendering text layer
+    // hide "offscreen" canvases appended to document when rendering text layer
     // https://github.com/mozilla/pdf.js/blob/642b9a5ae67ef642b9a8808fd9efd447e8c350e2/web/pdf_viewer.css#L51-L58
     for (const canvas of document.querySelectorAll('.hiddenCanvasElement'))
         Object.assign(canvas.style, {

commit 3b9d318f3a97dacb983b204b13f28dbf0eab3ffc
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sat Jan 17 21:21:02 2026 +0800

    Scroll to center in zoomed in mode
---
 fixed-layout.js | 9 +++++++--
 1 file changed, 7 insertions(+), 2 deletions(-)

diff --git a/fixed-layout.js b/fixed-layout.js
index a184b4d..fd5e0b9 100644
--- a/fixed-layout.js
+++ b/fixed-layout.js
@@ -184,11 +184,16 @@ export class FixedLayout extends HTMLElement {
                 element.style.display = 'none'
             }
 
+            const container= element.parentNode.host
+            const containerWidth = container.clientWidth
+            const containerHeight = container.clientHeight
+            container.scrollLeft = (element.clientWidth - containerWidth) / 2
+
             return {
                 width: element.clientWidth,
                 height: element.clientHeight,
-                containerWidth: element.parentNode.host.clientWidth,
-                containerHeight: element.parentNode.host.clientHeight,
+                containerWidth,
+                containerHeight,
             }
         }
         if (this.#center) {

commit f443513d52e677edf87c5771bcd5e139a90d4a39
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sat Jan 17 20:10:07 2026 +0800

    Bump pdf.js to the latest version
---
 package.json                              |  2 +-
 pdf.js                                    | 19 +++++++-----
 vendor/pdfjs/annotation_layer_builder.css | 50 +++++++++++++++++++++----------
 vendor/pdfjs/text_layer_builder.css       | 27 ++++++++++++-----
 4 files changed, 66 insertions(+), 32 deletions(-)

diff --git a/package.json b/package.json
index 9dd931e..dc87561 100644
--- a/package.json
+++ b/package.json
@@ -24,7 +24,7 @@
     "fflate": "^0.8.2",
     "fs-extra": "^11.2.0",
     "globals": "^15.9.0",
-    "pdfjs-dist": "^4.10.38",
+    "pdfjs-dist": "^5.4.530",
     "rollup": "^4.22.4"
   },
   "scripts": {
diff --git a/pdf.js b/pdf.js
index 76a5ad7..0ccd2f0 100644
--- a/pdf.js
+++ b/pdf.js
@@ -1,6 +1,6 @@
 const pdfjsPath = path => `/vendor/pdfjs/${path}`
 
-import '@pdfjs/pdf.mjs'
+import '@pdfjs/pdf.min.mjs'
 const pdfjsLib = globalThis.pdfjsLib
 pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsPath('pdf.worker.min.mjs')
 
@@ -10,10 +10,12 @@ let textLayerBuilderCSS = null
 let annotationLayerBuilderCSS = null
 
 const render = async (page, doc, zoom) => {
+    if (!doc) return
     const scale = zoom * devicePixelRatio
     doc.documentElement.style.transform = `scale(${1 / devicePixelRatio})`
     doc.documentElement.style.transformOrigin = 'top left'
-    doc.documentElement.style.setProperty('--scale-factor', scale)
+    doc.documentElement.style.setProperty('--total-scale-factor', scale)
+    doc.documentElement.style.setProperty('--scale-round-x', '1px')
     const viewport = page.getViewport({ scale })
 
     // the canvas must be in the `PDFDocument`'s `ownerDocument`
@@ -158,13 +160,13 @@ const render = async (page, doc, zoom) => {
     container.style.cursor = 'grab'
 
     const div = doc.querySelector('.annotationLayer')
-    await new pdfjsLib.AnnotationLayer({ page, viewport, div }).render({
+    const linkService = {
+        goToDestination: () => {},
+        getDestinationHash: dest => JSON.stringify(dest),
+        addLinkAttributes: (link, url) => link.href = url,
+    }
+    await new pdfjsLib.AnnotationLayer({ page, viewport, div, linkService }).render({
         annotations: await page.getAnnotations(),
-        linkService: {
-            goToDestination: () => {},
-            getDestinationHash: dest => JSON.stringify(dest),
-            addLinkAttributes: (link, url) => link.href = url,
-        },
     })
 }
 
@@ -223,6 +225,7 @@ export const makePDF = async file => {
     }
     const pdf = await pdfjsLib.getDocument({
         range: transport,
+        wasmUrl: pdfjsPath(''),
         cMapUrl: pdfjsPath('cmaps/'),
         standardFontDataUrl: pdfjsPath('standard_fonts/'),
         isEvalSupported: false,
diff --git a/vendor/pdfjs/annotation_layer_builder.css b/vendor/pdfjs/annotation_layer_builder.css
index 3047adb..c1c2a8d 100644
--- a/vendor/pdfjs/annotation_layer_builder.css
+++ b/vendor/pdfjs/annotation_layer_builder.css
@@ -14,6 +14,8 @@
  */
 
 .annotationLayer {
+  color-scheme: only light;
+
   --annotation-unfocused-field-background: url("data:image/svg+xml;charset=UTF-8,<svg width='1px' height='1px' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' style='fill:rgba(0, 54, 255, 0.13);'/></svg>");
   --input-focus-border-color: Highlight;
   --input-focus-outline: 1px solid Canvas;
@@ -50,7 +52,7 @@
     }
 
     .popupAnnotation .popup {
-      outline: calc(1.5px * var(--scale-factor)) solid CanvasText !important;
+      outline: calc(1.5px * var(--total-scale-factor)) solid CanvasText !important;
       background-color: ButtonFace !important;
       color: ButtonText !important;
     }
@@ -67,7 +69,7 @@
     }
 
     .popupAnnotation.focused .popup {
-      outline: calc(3px * var(--scale-factor)) solid Highlight !important;
+      outline: calc(3px * var(--total-scale-factor)) solid Highlight !important;
     }
   }
 
@@ -108,7 +110,6 @@
       white-space: nowrap;
       font: 10px sans-serif;
       line-height: 1.35;
-      user-select: none;
     }
   }
 
@@ -118,12 +119,23 @@
     pointer-events: auto;
     box-sizing: border-box;
     transform-origin: 0 0;
+    user-select: none;
 
     &:has(div.annotationContent) {
       canvas.annotationContent {
         display: none;
       }
     }
+
+    .overlaidText {
+      position: absolute;
+      top: 0;
+      left: 0;
+      width: 0;
+      height: 0;
+      display: inline-block;
+      overflow: hidden;
+    }
   }
 
   .textLayer.selecting ~ & section {
@@ -143,7 +155,6 @@
     > a:hover {
     opacity: 0.2;
     background-color: rgb(255 255 0);
-    box-shadow: 0 2px 10px rgb(255 255 0);
   }
 
   .linkAnnotation.hasBorder:hover {
@@ -169,7 +180,7 @@
     background-image: var(--annotation-unfocused-field-background);
     border: 2px solid var(--input-unfocused-border-color);
     box-sizing: border-box;
-    font: calc(9px * var(--scale-factor)) sans-serif;
+    font: calc(9px * var(--total-scale-factor)) sans-serif;
     height: 100%;
     margin: 0;
     vertical-align: top;
@@ -296,7 +307,7 @@
 
   .popupAnnotation {
     position: absolute;
-    font-size: calc(9px * var(--scale-factor));
+    font-size: calc(9px * var(--total-scale-factor));
     pointer-events: none;
     width: max-content;
     max-width: 45%;
@@ -305,16 +316,18 @@
 
   .popup {
     background-color: rgb(255 255 153);
-    box-shadow: 0 calc(2px * var(--scale-factor))
-      calc(5px * var(--scale-factor)) rgb(136 136 136);
-    border-radius: calc(2px * var(--scale-factor));
+    color: black;
+    box-shadow: 0 calc(2px * var(--total-scale-factor))
+      calc(5px * var(--total-scale-factor)) rgb(136 136 136);
+    border-radius: calc(2px * var(--total-scale-factor));
     outline: 1.5px solid rgb(255 255 74);
-    padding: calc(6px * var(--scale-factor));
+    padding: calc(6px * var(--total-scale-factor));
     cursor: pointer;
     font: message-box;
     white-space: normal;
     word-wrap: break-word;
     pointer-events: auto;
+    user-select: text;
   }
 
   .popupAnnotation.focused .popup {
@@ -322,36 +335,41 @@
   }
 
   .popup * {
-    font-size: calc(9px * var(--scale-factor));
+    font-size: calc(9px * var(--total-scale-factor));
   }
 
   .popup > .header {
     display: inline-block;
   }
 
-  .popup > .header h1 {
+  .popup > .header > .title {
     display: inline;
+    font-weight: bold;
   }
 
   .popup > .header .popupDate {
     display: inline-block;
-    margin-left: calc(5px * var(--scale-factor));
+    margin-left: calc(5px * var(--total-scale-factor));
     width: fit-content;
   }
 
   .popupContent {
     border-top: 1px solid rgb(51 51 51);
-    margin-top: calc(2px * var(--scale-factor));
-    padding-top: calc(2px * var(--scale-factor));
+    margin-top: calc(2px * var(--total-scale-factor));
+    padding-top: calc(2px * var(--total-scale-factor));
   }
 
   .richText > * {
     white-space: pre-wrap;
-    font-size: calc(9px * var(--scale-factor));
+    font-size: calc(9px * var(--total-scale-factor));
   }
 
   .popupTriggerArea {
     cursor: pointer;
+
+    &:hover {
+      backdrop-filter: var(--hcm-highlight-filter);
+    }
   }
 
   section svg {
diff --git a/vendor/pdfjs/text_layer_builder.css b/vendor/pdfjs/text_layer_builder.css
index 8dbac99..a2eb5ad 100644
--- a/vendor/pdfjs/text_layer_builder.css
+++ b/vendor/pdfjs/text_layer_builder.css
@@ -14,6 +14,8 @@
  */
 
 .textLayer {
+  color-scheme: only light;
+
   position: absolute;
   text-align: initial;
   inset: 0;
@@ -38,19 +40,30 @@
     transform-origin: 0% 0%;
   }
 
+  /* We multiply the font size by --min-font-size, and then scale the text
+   * elements by 1/--min-font-size. This allows us to effectively ignore the
+   * minimum font size enforced by the browser, so that the text layer <span>s
+   * can always match the size of the text in the canvas. */
+  --min-font-size: 1;
+  --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
+  --min-font-size-inv: calc(1 / var(--min-font-size));
+
   > :not(.markedContent),
   .markedContent span:not(.markedContent) {
     z-index: 1;
+
+    --font-height: 0; /* set by text_layer.js */
+    font-size: calc(var(--text-scale-factor) * var(--font-height));
+
+    --scale-x: 1;
+    --rotate: 0deg;
+    transform: rotate(var(--rotate)) scaleX(var(--scale-x))
+      scale(var(--min-font-size-inv));
   }
 
-  /* Only necessary in Google Chrome, see issue 14205, and most unfortunately
-   * the problem doesn't show up in "text" reference tests. */
-  /*#if !MOZCENTRAL*/
-  span.markedContent {
-    top: 0;
-    height: 0;
+  .markedContent {
+    display: contents;
   }
-  /*#endif*/
 
   span[role="img"] {
     user-select: none;

commit 133ae252b92bf09bc5900672cd6f3049c758a2b5
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sat Jan 17 15:35:18 2026 +0800

    Support panning in fixed layout documents
---
 fixed-layout.js | 62 ++++++++++++++++++++++++++++++++++++++++++++++-----------
 paginator.js    | 12 +++++++++++
 view.js         |  9 +++++++++
 3 files changed, 71 insertions(+), 12 deletions(-)

diff --git a/fixed-layout.js b/fixed-layout.js
index 9f4df15..a184b4d 100644
--- a/fixed-layout.js
+++ b/fixed-layout.js
@@ -47,6 +47,8 @@ export class FixedLayout extends HTMLElement {
     #zoom
     #scaleFactor = 1.0
     #scrollLocked = false
+    #isOverflowX = false
+    #isOverflowY = false
     constructor() {
         super()
 
@@ -56,9 +58,14 @@ export class FixedLayout extends HTMLElement {
             width: 100%;
             height: 100%;
             display: flex;
-            justify-content: center;
+            justify-content: flex-start;
             align-items: center;
             overflow: auto;
+        }
+        @supports (justify-content: safe center) {
+          :host {
+            justify-content: safe center;
+          }
         }`)
 
         this.#observer.observe(this)
@@ -150,7 +157,7 @@ export class FixedLayout extends HTMLElement {
             ) || 1
         scale *= this.#scaleFactor
 
-        const transform = frame => {
+        const transform = ({frame, styles}) => {
             let { element, iframe, width, height, blank, onZoom } = frame
             if (!iframe) return
             if (onZoom) onZoom({ doc: frame.iframe.contentDocument, scale })
@@ -164,29 +171,38 @@ export class FixedLayout extends HTMLElement {
                 display: blank ? 'none' : 'block',
             })
             Object.assign(element.style, {
-                width: `${(width ?? blankWidth) * scale / this.#scaleFactor}px`,
-                height: `${(height ?? blankHeight) * scale / this.#scaleFactor}px`,
+                width: `${(width ?? blankWidth) * scale}px`,
+                height: `${(height ?? blankHeight) * scale}px`,
                 flexShrink: '0',
                 display: zoomedOut ? 'flex' : 'block',
                 marginBlock: zoomedOut ? undefined : 'auto',
                 alignItems: zoomedOut ? 'center' : undefined,
                 justifyContent: zoomedOut ? 'center' : undefined,
+                ...styles,
             })
             if (portrait && frame !== target) {
                 element.style.display = 'none'
             }
-            const iframeWidth = width * iframeScale
-            const containerWidth = element.clientWidth
-            if (containerWidth > 0) {
-                const scrollableContainer = element.parentNode.host
-                scrollableContainer.scrollLeft = (iframeWidth - containerWidth) / 2
+
+            return {
+                width: element.clientWidth,
+                height: element.clientHeight,
+                containerWidth: element.parentNode.host.clientWidth,
+                containerHeight: element.parentNode.host.clientHeight,
             }
         }
         if (this.#center) {
-            transform(this.#center)
+            const dimensions = transform({frame: this.#center, styles: { marginInline: 'auto' }})
+            const {width, height, containerWidth, containerHeight} = dimensions
+            this.#isOverflowX = width > containerWidth
+            this.#isOverflowY = height > containerHeight
         } else {
-            transform(left)
-            transform(right)
+            const leftDimensions = transform({frame: left, styles: { marginInlineStart: 'auto' }})
+            const rightDimensions = transform({frame: right, styles: { marginInlineEnd: 'auto' }})
+            const {width: leftWidth, height: leftHeight, containerWidth, containerHeight} = leftDimensions
+            const {width: rightWidth, height: rightHeight} = rightDimensions
+            this.#isOverflowX = leftWidth + rightWidth > containerWidth
+            this.#isOverflowY = Math.max(leftHeight, rightHeight) > containerHeight
         }
     }
     async #showSpread({ left, right, center, side }) {
@@ -293,6 +309,12 @@ export class FixedLayout extends HTMLElement {
     set scrollLocked(value) {
         this.#scrollLocked = value
     }
+    get isOverflowX() {
+        return this.#isOverflowX
+    }
+    get isOverflowY() {
+        return this.#isOverflowY
+    }
     #reportLocation(reason) {
         this.dispatchEvent(new CustomEvent('relocate', { detail:
             { reason, range: null, index: this.index, fraction: 0, size: 1 } }))
@@ -349,6 +371,22 @@ export class FixedLayout extends HTMLElement {
         const s = this.rtl ? this.#goRight() : this.#goLeft()
         if (!s) return this.goToSpread(this.#index - 1, this.rtl ? 'left' : 'right', 'page')
     }
+    async pan(dx, dy) {
+        if (this.#scrollLocked) return
+        this.#scrollLocked = true
+
+        const transform = frame => {
+            let { element, iframe } = frame
+            if (!iframe || !element) return
+
+            const scrollableContainer = element.parentNode.host
+            scrollableContainer.scrollLeft += dx
+            scrollableContainer.scrollTop += dy
+        }
+
+        transform(this.#center ?? this.#right ?? {})
+        this.#scrollLocked = false
+    }
     getContents() {
         return Array.from(this.#root.querySelectorAll('iframe'), frame => ({
             doc: frame.contentDocument,
diff --git a/paginator.js b/paginator.js
index bfa0e5d..832589c 100644
--- a/paginator.js
+++ b/paginator.js
@@ -872,6 +872,12 @@ export class Paginator extends HTMLElement {
     get containerPosition() {
         return this.#container[this.scrollProp]
     }
+    get isOverflowX() {
+        return false
+    }
+    get isOverflowY() {
+        return false
+    }
     set containerPosition(newVal) {
         this.#container[this.scrollProp] = newVal
     }
@@ -1198,6 +1204,12 @@ export class Paginator extends HTMLElement {
     async next(distance) {
         return await this.#turnPage(1, distance)
     }
+    async pan(dx, dy) {
+        if (this.#locked) return
+        this.#locked = true
+        this.scrollBy(dx, dy)
+        this.#locked = false
+    }
     prevSection() {
         return this.goTo({ index: this.#adjacentIndex(-1) })
     }
diff --git a/view.js b/view.js
index 10a2916..9271cd7 100644
--- a/view.js
+++ b/view.js
@@ -558,6 +558,15 @@ export class View extends HTMLElement {
     async next(distance) {
         await this.renderer.next(distance)
     }
+    async pan(dx, dy) {
+        await this.renderer.pan(dx, dy)
+    }
+    isOverflowX() {
+        return this.renderer.isOverflowX
+    }
+    isOverflowY() {
+        return this.renderer.isOverflowY
+    }
     goLeft() {
         return this.book.dir === 'rtl' ? this.next() : this.prev()
     }

commit 47be9d814bf7919b7137cab79afa2b96697afbc6
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Fri Jan 16 00:35:39 2026 +0800

    Don't scroll if animation is turned off or in eink mode
---
 paginator.js | 1 +
 1 file changed, 1 insertion(+)

diff --git a/paginator.js b/paginator.js
index 71153b6..bfa0e5d 100644
--- a/paginator.js
+++ b/paginator.js
@@ -948,6 +948,7 @@ export class Paginator extends HTMLElement {
         state.dx += dx
         state.dy += dy
         this.#touchScrolled = true
+        if (!this.hasAttribute('animated') || this.hasAttribute('eink')) return
         if (!this.#vertical && Math.abs(state.dx) >= Math.abs(state.dy) && !this.hasAttribute('eink') && (!isStylus || Math.abs(dx) > 1)) {
             this.scrollBy(dx, 0)
         } else if (this.#vertical && Math.abs(state.dx) < Math.abs(state.dy) && !this.hasAttribute('eink') && (!isStylus || Math.abs(dy) > 1)) {

commit ffb8248449ac0cbe8611149d687b1a4d648adda1
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Wed Jan 7 23:05:40 2026 +0800

    Support scroll lock for instant annotation
---
 fixed-layout.js |  7 +++++++
 overlayer.js    | 12 ++++++++++--
 paginator.js    |  5 +++++
 3 files changed, 22 insertions(+), 2 deletions(-)

diff --git a/fixed-layout.js b/fixed-layout.js
index 3b79484..9f4df15 100644
--- a/fixed-layout.js
+++ b/fixed-layout.js
@@ -46,6 +46,7 @@ export class FixedLayout extends HTMLElement {
     #side
     #zoom
     #scaleFactor = 1.0
+    #scrollLocked = false
     constructor() {
         super()
 
@@ -286,6 +287,12 @@ export class FixedLayout extends HTMLElement {
             ? spread.left ?? spread.right : spread.right ?? spread.left)
         return this.book.sections.indexOf(section)
     }
+    get scrollLocked() {
+        return this.#scrollLocked
+    }
+    set scrollLocked(value) {
+        this.#scrollLocked = value
+    }
     #reportLocation(reason) {
         this.dispatchEvent(new CustomEvent('relocate', { detail:
             { reason, range: null, index: this.index, fraction: 0, size: 1 } }))
diff --git a/overlayer.js b/overlayer.js
index a82ad81..8c954d8 100644
--- a/overlayer.js
+++ b/overlayer.js
@@ -95,10 +95,18 @@ export class Overlayer {
         const arr = Array.from(this.#map.entries())
         // loop in reverse to hit more recently added items first
         for (let i = arr.length - 1; i >= 0; i--) {
+            const tolerance = 5
             const [key, obj] = arr[i]
-            for (const { left, top, right, bottom } of obj.rects)
-                if (top <= y && left <= x && bottom > y && right > x)
+            for (const { left, top, right, bottom } of obj.rects) {
+                if (
+                    top <= y + tolerance &&
+                    left <= x + tolerance &&
+                    bottom > y - tolerance &&
+                    right > x - tolerance
+                ) {
                     return [key, obj.range, { left, top, right, bottom }]
+                }
+            }
         }
         return []
     }
diff --git a/paginator.js b/paginator.js
index 949beac..71153b6 100644
--- a/paginator.js
+++ b/paginator.js
@@ -479,6 +479,7 @@ export class Paginator extends HTMLElement {
     #touchState
     #touchScrolled
     #lastVisibleRange
+    #scrollLocked = false
     constructor() {
         super()
         this.#root.innerHTML = `<style>
@@ -874,6 +875,9 @@ export class Paginator extends HTMLElement {
     set containerPosition(newVal) {
         this.#container[this.scrollProp] = newVal
     }
+    set scrollLocked(value) {
+        this.#scrollLocked = value
+    }
 
     scrollBy(dx, dy) {
         const delta = this.#vertical ? dy : dx
@@ -932,6 +936,7 @@ export class Paginator extends HTMLElement {
         const touch = e.changedTouches[0]
         const isStylus = touch.touchType === 'stylus'
         if (!isStylus) e.preventDefault()
+        if (this.#scrollLocked) return
         const x = touch.screenX, y = touch.screenY
         const dx = state.x - x, dy = state.y - y
         const dt = e.timeStamp - state.t

commit 4eb5ca42a4c4ea36a8d43d0bd8349646d4974d65
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sun Jan 4 18:52:36 2026 +0800

    Use cached search results
---
 view.js | 23 +++++++++++++++++++----
 1 file changed, 19 insertions(+), 4 deletions(-)

diff --git a/view.js b/view.js
index 8f5c97a..10a2916 100644
--- a/view.js
+++ b/view.js
@@ -584,12 +584,26 @@ export class View extends HTMLElement {
     async * search(opts) {
         this.clearSearch()
         const { searchMatcher } = await import('./search.js')
-        const { query, index } = opts
+        const { sections } = this.book
+        const { query, index, results } = opts
         const matcher = searchMatcher(textWalker,
             { defaultLocale: this.language, ...opts })
-        const iter = index != null
-            ? this.#searchSection(matcher, query, index)
-            : this.#searchBook(matcher, query)
+
+        const iter = results?.length
+            ? (async function* () {
+                for (const result of results) {
+                    if (result.subitems) {
+                        const progress = (result.index + 1) / sections.length
+                        yield { progress }
+                        yield { index: result.index, subitems: result.subitems }
+                    } else {
+                        yield { cfi: result.cfi, excerpt: result.excerpt }
+                    }
+                }
+            })()
+            : index != null
+                ? this.#searchSection(matcher, query, index)
+                : this.#searchBook(matcher, query)
 
         const list = []
         this.#searchResults.set(index, list)
@@ -601,6 +615,7 @@ export class View extends HTMLElement {
                 this.#searchResults.set(result.index, list)
                 for (const item of list) this.addAnnotation(item)
                 yield {
+                    index: result.index,
                     label: this.#tocProgress.getProgress(result.index)?.label ?? '',
                     subitems: result.subitems,
                 }

commit bab0bccbe999877c0c14770387ca033ae247ad42
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sun Dec 28 20:42:27 2025 +0800

    Vertical bubble overlay
---
 overlayer.js | 21 +++++++++++++++------
 view.js      |  6 +++++-
 2 files changed, 20 insertions(+), 7 deletions(-)

diff --git a/overlayer.js b/overlayer.js
index 1a7dda4..a82ad81 100644
--- a/overlayer.js
+++ b/overlayer.js
@@ -210,14 +210,15 @@ export class Overlayer {
         return g
     }
     static bubble(rects, options = {}) {
-        const { color = '#fbbf24', opacity = 0.85, size = 20, padding = 10 } = options
+        const { color = '#fbbf24', writingMode, opacity = 0.85, size = 20, padding = 10 } = options
+        const isVertical = writingMode === 'vertical-rl' || writingMode === 'vertical-lr'
         const g = createSVGElement('g')
         g.style.opacity = opacity
         if (rects.length === 0) return g
         rects.splice(1)
         const firstRect = rects[0]
-        const x = firstRect.right - size + padding
-        const y = firstRect.top - size + padding
+        const x = isVertical ? firstRect.right - size + padding : firstRect.right - size + padding
+        const y = isVertical ? firstRect.bottom - size + padding : firstRect.top - size + padding
         firstRect.top = y - padding
         firstRect.right = x + size + padding
         firstRect.bottom = y + size + padding
@@ -252,9 +253,9 @@ export class Overlayer {
         lineGroup.setAttribute('stroke', 'rgba(0, 0, 0, 0.3)')
         lineGroup.setAttribute('stroke-width', '1.5')
         lineGroup.setAttribute('stroke-linecap', 'round')
-        const lineY1 = y + s * 0.25
-        const lineY2 = y + s * 0.4
-        const lineY3 = y + s * 0.55
+        const lineY1 = y + s * 0.18
+        const lineY2 = y + s * 0.33
+        const lineY3 = y + s * 0.48
         const lineX1 = x + s * 0.2
         const lineX2 = x + s * 0.8
         const line1 = createSVGElement('line')
@@ -273,6 +274,14 @@ export class Overlayer {
         line3.setAttribute('x2', x + s * 0.6)
         line3.setAttribute('y2', lineY3)
         lineGroup.append(line1, line2, line3)
+
+        if (isVertical) {
+            const centerX = x + s / 2
+            const centerY = y + s / 2
+            bubble.setAttribute('transform', `rotate(90 ${centerX} ${centerY})`)
+            lineGroup.setAttribute('transform', `rotate(90 ${centerX} ${centerY})`)
+        }
+
         g.append(bubble)
         g.append(lineGroup)
         return g
diff --git a/view.js b/view.js
index fff4521..8f5c97a 100644
--- a/view.js
+++ b/view.js
@@ -402,7 +402,8 @@ export class View extends HTMLElement {
                     return
                 }
                 const range = doc ? anchor(doc) : anchor
-                overlayer.add(value, range, Overlayer.bubble)
+                const draw = (func, opts) => overlayer.add(value, range, func, opts)
+                this.#emit('draw-annotation', { draw, annotation, doc, range })
             }
             return
         }
@@ -438,7 +439,10 @@ export class View extends HTMLElement {
 
         let lastHitTestTime = 0
         const THROTTLE_MS = 200
+        const isAndroid = /Android/i.test(navigator.userAgent)
+
         doc.addEventListener('mousemove', (e) => {
+            if (isAndroid) return
             const now = performance.now()
             if (now - lastHitTestTime < THROTTLE_MS) return
             lastHitTestTime = now

commit 873b545933d911047a472d388fa8aab6c545235c
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sat Dec 27 23:36:27 2025 +0800

    Add bubble drawer for notes
---
 overlayer.js | 70 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 view.js      | 34 +++++++++++++++++++++++++++--
 2 files changed, 101 insertions(+), 3 deletions(-)

diff --git a/overlayer.js b/overlayer.js
index 6b85373..1a7dda4 100644
--- a/overlayer.js
+++ b/overlayer.js
@@ -98,7 +98,7 @@ export class Overlayer {
             const [key, obj] = arr[i]
             for (const { left, top, right, bottom } of obj.rects)
                 if (top <= y && left <= x && bottom > y && right > x)
-                    return [key, obj.range]
+                    return [key, obj.range, { left, top, right, bottom }]
         }
         return []
     }
@@ -209,6 +209,74 @@ export class Overlayer {
         }
         return g
     }
+    static bubble(rects, options = {}) {
+        const { color = '#fbbf24', opacity = 0.85, size = 20, padding = 10 } = options
+        const g = createSVGElement('g')
+        g.style.opacity = opacity
+        if (rects.length === 0) return g
+        rects.splice(1)
+        const firstRect = rects[0]
+        const x = firstRect.right - size + padding
+        const y = firstRect.top - size + padding
+        firstRect.top = y - padding
+        firstRect.right = x + size + padding
+        firstRect.bottom = y + size + padding
+        firstRect.left = x - padding
+        const bubble = createSVGElement('path')
+        const s = size
+        const r = s * 0.15
+        // Speech bubble shape with a small tail
+        // Main rounded rectangle body
+        const d = `
+            M ${x + r} ${y}
+            h ${s - 2 * r}
+            a ${r} ${r} 0 0 1 ${r} ${r}
+            v ${s * 0.65 - 2 * r}
+            a ${r} ${r} 0 0 1 ${-r} ${r}
+            h ${-s * 0.3}
+            l ${-s * 0.15} ${s * 0.2}
+            l ${s * 0.05} ${-s * 0.2}
+            h ${-s * 0.6 + 2 * r}
+            a ${r} ${r} 0 0 1 ${-r} ${-r}
+            v ${-s * 0.65 + 2 * r}
+            a ${r} ${r} 0 0 1 ${r} ${-r}
+            z
+        `.replace(/\s+/g, ' ').trim()
+
+        bubble.setAttribute('d', d)
+        bubble.setAttribute('fill', color)
+        bubble.setAttribute('stroke', 'rgba(0, 0, 0, 0.2)')
+        bubble.setAttribute('stroke-width', '1')
+        // Add horizontal lines inside to represent text
+        const lineGroup = createSVGElement('g')
+        lineGroup.setAttribute('stroke', 'rgba(0, 0, 0, 0.3)')
+        lineGroup.setAttribute('stroke-width', '1.5')
+        lineGroup.setAttribute('stroke-linecap', 'round')
+        const lineY1 = y + s * 0.25
+        const lineY2 = y + s * 0.4
+        const lineY3 = y + s * 0.55
+        const lineX1 = x + s * 0.2
+        const lineX2 = x + s * 0.8
+        const line1 = createSVGElement('line')
+        line1.setAttribute('x1', lineX1)
+        line1.setAttribute('y1', lineY1)
+        line1.setAttribute('x2', lineX2)
+        line1.setAttribute('y2', lineY1)
+        const line2 = createSVGElement('line')
+        line2.setAttribute('x1', lineX1)
+        line2.setAttribute('y1', lineY2)
+        line2.setAttribute('x2', lineX2)
+        line2.setAttribute('y2', lineY2)
+        const line3 = createSVGElement('line')
+        line3.setAttribute('x1', lineX1)
+        line3.setAttribute('y1', lineY3)
+        line3.setAttribute('x2', x + s * 0.6)
+        line3.setAttribute('y2', lineY3)
+        lineGroup.append(line1, line2, line3)
+        g.append(bubble)
+        g.append(lineGroup)
+        return g
+    }
     // make an exact copy of an image in the overlay
     // one can then apply filters to the entire element, without affecting them;
     // it's a bit silly and probably better to just invert images twice
diff --git a/view.js b/view.js
index a6d4b81..fff4521 100644
--- a/view.js
+++ b/view.js
@@ -5,6 +5,8 @@ import { textWalker } from './text-walker.js'
 
 const SEARCH_PREFIX = 'foliate-search:'
 
+const NOTE_PREFIX = 'foliate-note:'
+
 const isZip = async file => {
     const arr = new Uint8Array(await file.slice(0, 4).arrayBuffer())
     return arr[0] === 0x50 && arr[1] === 0x4b && arr[2] === 0x03 && arr[3] === 0x04
@@ -389,6 +391,20 @@ export class View extends HTMLElement {
                 overlayer.add(value, range, Overlayer.outline)
             }
             return
+        } else if (value.startsWith(NOTE_PREFIX)) {
+            const cfi = value.replace(NOTE_PREFIX, '')
+            const { index, anchor } = await this.resolveNavigation(cfi)
+            const obj = this.#getOverlayer(index)
+            if (obj) {
+                const { overlayer, doc } = obj
+                if (remove) {
+                    overlayer.remove(value)
+                    return
+                }
+                const range = doc ? anchor(doc) : anchor
+                overlayer.add(value, range, Overlayer.bubble)
+            }
+            return
         }
         const { index, anchor } = await this.resolveNavigation(value)
         const obj = this.#getOverlayer(index)
@@ -414,12 +430,26 @@ export class View extends HTMLElement {
     #createOverlayer({ doc, index }) {
         const overlayer = new Overlayer(doc)
         doc.addEventListener('click', e => {
-            const [value, range] = overlayer.hitTest(e)
+            const [value, range, rect] = overlayer.hitTest(e)
             if (value && !value.startsWith(SEARCH_PREFIX)) {
-                this.#emit('show-annotation', { value, index, range })
+                this.#emit('show-annotation', { value, index, range, rect })
             }
         }, false)
 
+        let lastHitTestTime = 0
+        const THROTTLE_MS = 200
+        doc.addEventListener('mousemove', (e) => {
+            const now = performance.now()
+            if (now - lastHitTestTime < THROTTLE_MS) return
+            lastHitTestTime = now
+            const [value] = overlayer.hitTest(e)
+            if (value && !value.startsWith(SEARCH_PREFIX)) {
+                doc.body.style.cursor = 'pointer'
+            } else {
+                doc.body.style.cursor = ''
+            }
+        })
+
         const list = this.#searchResults.get(index)
         if (list) for (const item of list) this.addAnnotation(item)
 

commit c80ead5f347385b09cb3c776b2cd26fc7cea8cda
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Fri Dec 26 16:37:34 2025 +0800

    Fixed visible range in scrolled mode
---
 paginator.js | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

diff --git a/paginator.js b/paginator.js
index 1d63345..949beac 100644
--- a/paginator.js
+++ b/paginator.js
@@ -1059,7 +1059,7 @@ export class Paginator extends HTMLElement {
     }
     #getVisibleRange() {
         if (this.scrolled) return getVisibleRange(this.#view.document,
-            this.start + this.#marginTop, this.end - this.#marginBottom, this.#getRectMapper())
+            this.start, this.end, this.#getRectMapper())
         const size = this.#rtl ? -this.size : this.size
         return getVisibleRange(this.#view.document,
             this.start - size, this.end - size, this.#getRectMapper())

commit 43f30812d19f49c9539cf9ca4fb558f90422c624
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Wed Dec 24 00:00:27 2025 +0800

    Fix XML parsing error for HTML entities in NCX files
---
 epub.js | 24 +++++++++++++++++++++++-
 1 file changed, 23 insertions(+), 1 deletion(-)

diff --git a/epub.js b/epub.js
index 39ae510..254b498 100644
--- a/epub.js
+++ b/epub.js
@@ -995,10 +995,32 @@ export class EPUB {
         this.getSize = getSize
         this.#encryption = new Encryption(deobfuscators(sha1))
     }
+    #sanitizeXMLEntities(str) {
+        // Common HTML entities that aren't valid in XML
+        const entityMap = {
+            'nbsp': '&#160;',
+            'mdash': '&#8212;',
+            'ndash': '&#8211;',
+            'ldquo': '&#8220;',
+            'rdquo': '&#8221;',
+            'lsquo': '&#8216;',
+            'rsquo': '&#8217;',
+            'hellip': '&#8230;',
+            'copy': '&#169;',
+            'reg': '&#174;',
+            'trade': '&#8482;',
+            'bull': '&#8226;',
+            'middot': '&#183;',
+        }
+        return str.replace(/&([a-z]+);/gi, (match, entity) => {
+            return entityMap[entity.toLowerCase()] || match
+        })
+    }
     async #loadXML(uri) {
         const str = await this.loadText(uri)
         if (!str) return null
-        const doc = this.parser.parseFromString(str, MIME.XML)
+        const sanitized = this.#sanitizeXMLEntities(str)
+        const doc = this.parser.parseFromString(sanitized, MIME.XML)
         if (doc.querySelector('parsererror'))
             throw new Error(`XML parsing error: ${uri}
 ${doc.querySelector('parsererror').innerText}`)

commit d15091c5239d6a2720a8a80d5036d725f6b9a9d3
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Tue Dec 23 12:32:36 2025 +0800

    Fixed an issue where a fractional height caused an incorrect column count
---
 paginator.js | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)

diff --git a/paginator.js b/paginator.js
index e804623..1d63345 100644
--- a/paginator.js
+++ b/paginator.js
@@ -797,7 +797,7 @@ export class Paginator extends HTMLElement {
             return { flow, marginTop, marginRight, marginBottom, marginLeft, gap, columnWidth }
         }
 
-        const divisor = Math.min(maxColumnCount + (vertical ? 1 : 0), Math.ceil(size / maxInlineSize))
+        const divisor = Math.min(maxColumnCount + (vertical ? 1 : 0), Math.ceil(Math.floor(size) / Math.floor(maxInlineSize)))
         const columnWidth = vertical
             ? (size / divisor - marginTop * 1.5 - marginBottom * 1.5)
             : (size / divisor - gap - marginRight / 2 - marginLeft / 2)
@@ -809,7 +809,7 @@ export class Paginator extends HTMLElement {
         this.#replaceBackground(background, this.columnCount)
 
         const marginalDivisor = vertical
-            ? Math.min(2, Math.ceil(width / maxInlineSize))
+            ? Math.min(2, Math.ceil(Math.floor(width) / Math.floor(maxInlineSize)))
             : divisor
         const marginalStyle = {
             gridTemplateColumns: `repeat(${marginalDivisor}, 1fr)`,

commit 4b02f785603d33ca417447906d7ee96e3182b235
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Tue Dec 16 22:40:47 2025 +0800

    Add page margins vars for bleed layout
---
 paginator.js | 16 ++++++++++++----
 1 file changed, 12 insertions(+), 4 deletions(-)

diff --git a/paginator.js b/paginator.js
index 68692d6..e804623 100644
--- a/paginator.js
+++ b/paginator.js
@@ -307,6 +307,10 @@ class View {
             'column-width': 'auto',
             'height': 'auto',
             'width': 'auto',
+            '--page-margin-top': `${vertical ? marginTop * 1.5 : marginTop}px`,
+            '--page-margin-right': `${vertical ? marginRight : marginRight + gap /2}px`,
+            '--page-margin-bottom': `${vertical ? marginBottom * 1.5 : marginBottom}px`,
+            '--page-margin-left': `${vertical ? marginLeft : marginLeft + gap / 2}px`,
             '--available-width': `${Math.trunc(Math.min(window.innerWidth, columnWidth) - marginLeft - marginRight - gap - 60)}`,
             '--available-height': `${Math.trunc(window.innerHeight - marginTop - marginBottom)}`,
         })
@@ -342,6 +346,10 @@ class View {
             'min-height': 'none', 'min-width': 'none',
             // fix glyph clipping in WebKit
             '-webkit-line-box-contain': 'block glyphs replaced',
+            '--page-margin-top': `${vertical ? marginTop * 1.5 : marginTop}px`,
+            '--page-margin-right': `${vertical ? marginRight : marginRight / 2 + gap /2}px`,
+            '--page-margin-bottom': `${vertical ? marginBottom * 1.5 : marginBottom}px`,
+            '--page-margin-left': `${vertical ? marginLeft : marginLeft / 2 + gap / 2}px`,
             '--available-width': `${Math.trunc(columnWidth - marginLeft - marginRight - gap)}`,
             '--available-height': `${Math.trunc(height - marginTop - marginBottom)}`,
         })
@@ -503,11 +511,11 @@ export class Paginator extends HTMLElement {
             --_max-height: var(--_max-block-size);
             display: grid;
             grid-template-columns:
-                minmax(var(--_half-margin-left), 1fr)
-                var(--_half-margin-left)
+                minmax(0, 1fr)
+                var(--_margin-left)
                 minmax(0, calc(var(--_max-width) - var(--_gap)))
-                var(--_half-margin-right)
-                minmax(var(--_half-margin-right), 1fr);
+                var(--_margin-right)
+                minmax(0, 1fr);
             grid-template-rows:
                 minmax(var(--_margin-top), 1fr)
                 minmax(0, var(--_max-height))

commit 0e0096d1f0908a06458f35f02a09138aea786e31
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sun Dec 14 01:37:48 2025 +0800

    Respect max inline width setting
---
 paginator.js | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)

diff --git a/paginator.js b/paginator.js
index fd58d20..68692d6 100644
--- a/paginator.js
+++ b/paginator.js
@@ -531,12 +531,12 @@ export class Paginator extends HTMLElement {
             grid-row: 1 / -1;
         }
         #container {
-            grid-column: 1 / -1;
+            grid-column: 2 / 5;
             grid-row: 1 / -1;
             overflow: hidden;
         }
         :host([flow="scrolled"]) #container {
-            grid-column: 1 / -1;
+            grid-column: 2 / 5;
             grid-row: 1 / -1;
             overflow: auto;
         }

commit 869d15666486c067012bd4c933a5e76193ccb340
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Thu Dec 11 02:30:54 2025 +0800

    Select proper opds search link
---
 opds.js | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

diff --git a/opds.js b/opds.js
index c63c850..0d6369f 100644
--- a/opds.js
+++ b/opds.js
@@ -256,7 +256,7 @@ export const getOpenSearch = doc => {
     const children = Array.from(doc.documentElement.children)
 
     const $$urls = children.filter(filter('Url'))
-    const $url = $$urls.find(url => isOPDSSearch(url.getAttribute('type'))) ?? $$urls[0]
+    const $url = $$urls.find(url => isOPDSCatalog(url.getAttribute('type'))) ?? $$urls.find(url => isOPDSSearch(url.getAttribute('type'))) ?? $$urls[0]
     if (!$url) throw new Error('document must contain at least one Url element')
 
     const regex = /{(?:([^}]+?):)?(.+?)(\?)?}/g

commit 75725c286702968f8a03b82790574e2f59fd954b
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Thu Dec 11 01:06:32 2025 +0800

    Fix comic book layout
---
 fixed-layout.js | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)

diff --git a/fixed-layout.js b/fixed-layout.js
index e1a056c..3b79484 100644
--- a/fixed-layout.js
+++ b/fixed-layout.js
@@ -163,8 +163,8 @@ export class FixedLayout extends HTMLElement {
                 display: blank ? 'none' : 'block',
             })
             Object.assign(element.style, {
-                width: 'auto',
-                height: 'auto',
+                width: `${(width ?? blankWidth) * scale / this.#scaleFactor}px`,
+                height: `${(height ?? blankHeight) * scale / this.#scaleFactor}px`,
                 flexShrink: '0',
                 display: zoomedOut ? 'flex' : 'block',
                 marginBlock: zoomedOut ? undefined : 'auto',

commit e2a9054d94dfd361c3403f2c9919ae7f78fe584f
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Tue Dec 9 23:07:52 2025 +0800

    Make page margins pixel precision
---
 paginator.js | 22 ++++++++++------------
 1 file changed, 10 insertions(+), 12 deletions(-)

diff --git a/paginator.js b/paginator.js
index 6541c58..fd58d20 100644
--- a/paginator.js
+++ b/paginator.js
@@ -302,8 +302,8 @@ class View {
         setStylesImportant(doc.documentElement, {
             'box-sizing': 'border-box',
             'padding': vertical
-                ? `${marginTop}px ${gap}px ${marginBottom}px ${gap}px`
-                : `0px ${gap / 2 + marginRight}px 0px ${gap / 2 + marginLeft}px`,
+                ? `${marginTop * 1.5}px ${marginRight}px ${marginBottom * 1.5}px ${marginLeft}px`
+                : `${marginTop}px ${gap / 2 + marginRight / 2}px ${marginBottom}px ${gap / 2 + marginLeft / 2}px`,
             'column-width': 'auto',
             'height': 'auto',
             'width': 'auto',
@@ -414,15 +414,13 @@ class View {
             const otherSide = this.#vertical ? 'height' : 'width'
             const contentSize = documentElement.getBoundingClientRect()[side]
             const expandedSize = contentSize
-            const { marginTop, marginRight, marginBottom, marginLeft } = this.#layout
-            const padding = this.#vertical ? `0 ${marginRight}px 0 ${marginLeft}px` : `${marginTop}px 0 ${marginBottom}px 0`
-            this.#element.style.padding = padding
+            this.#element.style.padding = '0'
             this.#iframe.style[side] = `${expandedSize}px`
             this.#element.style[side] = `${expandedSize}px`
             this.#iframe.style[otherSide] = '100%'
             this.#element.style[otherSide] = '100%'
             if (this.#overlayer) {
-                this.#overlayer.element.style.margin = padding
+                this.#overlayer.element.style.margin = '0'
                 this.#overlayer.element.style.left = '0'
                 this.#overlayer.element.style.top = '0'
                 this.#overlayer.element.style[side] = `${expandedSize}px`
@@ -533,7 +531,7 @@ export class Paginator extends HTMLElement {
             grid-row: 1 / -1;
         }
         #container {
-            grid-column: 2 / 5;
+            grid-column: 1 / -1;
             grid-row: 1 / -1;
             overflow: hidden;
         }
@@ -788,12 +786,12 @@ export class Paginator extends HTMLElement {
             this.#header.replaceChildren()
             this.#footer.replaceChildren()
 
-            return { flow, marginTop, marginRight, marginBottom, marginLeft, gap: g * size, columnWidth }
+            return { flow, marginTop, marginRight, marginBottom, marginLeft, gap, columnWidth }
         }
 
         const divisor = Math.min(maxColumnCount + (vertical ? 1 : 0), Math.ceil(size / maxInlineSize))
         const columnWidth = vertical
-            ? (size / divisor - (marginTop + marginBottom) / 2)
+            ? (size / divisor - marginTop * 1.5 - marginBottom * 1.5)
             : (size / divisor - gap - marginRight / 2 - marginLeft / 2)
         this.setAttribute('dir', rtl ? 'rtl' : 'ltr')
 
@@ -965,7 +963,7 @@ export class Paginator extends HTMLElement {
             return this.#vertical
                 ? ({ left, right }) =>
                     ({ left: size - right - marginTop, right: size - left - marginBottom })
-                : ({ top, bottom }) => ({ left: top + marginTop, right: bottom + marginBottom })
+                : ({ top, bottom }) => ({ left: top - marginTop, right: bottom - marginBottom })
         }
         const pxSize = this.pages * this.size
         return this.#rtl
@@ -977,7 +975,7 @@ export class Paginator extends HTMLElement {
     }
     async #scrollToRect(rect, reason) {
         if (this.scrolled) {
-            const offset = this.#getRectMapper()(rect).left - this.#marginTop
+            const offset = this.#getRectMapper()(rect).left - 4
             return this.#scrollTo(offset, reason)
         }
         const offset = this.#getRectMapper()(rect).left
@@ -1020,7 +1018,7 @@ export class Paginator extends HTMLElement {
             // when the start of the range is immediately after a hyphen in the
             // previous column, there is an extra zero width rect in that column
             const rect = Array.from(rects)
-                .find(r => r.width > 0 && r.height > 0) || rects[0]
+                .find(r => r.width > 0 && r.height > 0 && r.x >= 0 && r.y >= 0) || rects[0]
             if (!rect) return
             await this.#scrollToRect(rect, reason)
             // focus the element when navigating with keyboard or screen reader

commit f2d10c16d15dad32cdc0da92e8fbe698bec82117
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sat Dec 6 17:54:59 2025 +0800

    Use ATOM as default OPDS search link
---
 opds.js | 9 ++++++++-
 1 file changed, 8 insertions(+), 1 deletion(-)

diff --git a/opds.js b/opds.js
index 7d92fc6..c63c850 100644
--- a/opds.js
+++ b/opds.js
@@ -66,6 +66,13 @@ export const isOPDSCatalog = str => {
     return mediaType === MIME.ATOM && parameters.profile?.toLowerCase() === 'opds-catalog'
 }
 
+export const isOPDSSearch = str => {
+    const parsed = parseMediaType(str)
+    if (!parsed) return false
+    const { mediaType } = parsed
+    return mediaType === MIME.ATOM
+}
+
 // ignore the namespace if it doesn't appear in document at all
 const useNS = (doc, ns) =>
     doc.lookupNamespaceURI(null) === ns || doc.lookupPrefix(ns) ? ns : null
@@ -249,7 +256,7 @@ export const getOpenSearch = doc => {
     const children = Array.from(doc.documentElement.children)
 
     const $$urls = children.filter(filter('Url'))
-    const $url = $$urls.find(url => isOPDSCatalog(url.getAttribute('type'))) ?? $$urls[0]
+    const $url = $$urls.find(url => isOPDSSearch(url.getAttribute('type'))) ?? $$urls[0]
     if (!$url) throw new Error('document must contain at least one Url element')
 
     const regex = /{(?:([^}]+?):)?(.+?)(\?)?}/g

commit d38c02bc8b48989e512fa23d3d69547b7f14e183
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Fri Dec 5 02:12:22 2025 +0800

    Fixed PDF zoomed layout and hand tool event handling
---
 fixed-layout.js | 10 ++++++++--
 pdf.js          |  1 -
 2 files changed, 8 insertions(+), 3 deletions(-)

diff --git a/fixed-layout.js b/fixed-layout.js
index 4adad62..e1a056c 100644
--- a/fixed-layout.js
+++ b/fixed-layout.js
@@ -163,8 +163,8 @@ export class FixedLayout extends HTMLElement {
                 display: blank ? 'none' : 'block',
             })
             Object.assign(element.style, {
-                width: `${(width ?? blankWidth) * scale / this.#scaleFactor}px`,
-                height: `${(height ?? blankHeight) * scale / this.#scaleFactor}px`,
+                width: 'auto',
+                height: 'auto',
                 flexShrink: '0',
                 display: zoomedOut ? 'flex' : 'block',
                 marginBlock: zoomedOut ? undefined : 'auto',
@@ -174,6 +174,12 @@ export class FixedLayout extends HTMLElement {
             if (portrait && frame !== target) {
                 element.style.display = 'none'
             }
+            const iframeWidth = width * iframeScale
+            const containerWidth = element.clientWidth
+            if (containerWidth > 0) {
+                const scrollableContainer = element.parentNode.host
+                scrollableContainer.scrollLeft = (iframeWidth - containerWidth) / 2
+            }
         }
         if (this.#center) {
             transform(this.#center)
diff --git a/pdf.js b/pdf.js
index 22624b5..76a5ad7 100644
--- a/pdf.js
+++ b/pdf.js
@@ -106,7 +106,6 @@ const render = async (page, doc, zoom) => {
                     scrollTop = scrollParent.scrollTop
                 }
                 container.style.cursor = 'grabbing'
-                e.preventDefault()
             }
         } else {
             container.classList.add('selecting')

commit 2823999e381df91dada5cf7ed86160f50edafc29
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Thu Dec 4 13:51:02 2025 +0800

    For unfolded devices with slightly taller height than width also use landscape layout
---
 fixed-layout.js | 3 ++-
 1 file changed, 2 insertions(+), 1 deletion(-)

diff --git a/fixed-layout.js b/fixed-layout.js
index fd963f4..4adad62 100644
--- a/fixed-layout.js
+++ b/fixed-layout.js
@@ -124,8 +124,9 @@ export class FixedLayout extends HTMLElement {
         const right = this.#center ?? this.#right ?? {}
         const target = side === 'left' ? left : right
         const { width, height } = this.getBoundingClientRect()
+        // for unfolded devices with slightly taller height than width also use landscape layout
         const portrait = this.spread !== 'both' && this.spread !== 'portrait'
-            && height > width
+            && height > width * 1.2
         this.#portrait = portrait
         const blankWidth = left.width ?? right.width ?? 0
         const blankHeight = left.height ?? right.height ?? 0

commit 11cfc19444382d02920a7329410c0373d2805c7a
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Wed Nov 26 18:20:05 2025 +0800

    Avoid Lookbehind assertions in regexp
---
 paginator.js | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

diff --git a/paginator.js b/paginator.js
index d86f6b7..6541c58 100644
--- a/paginator.js
+++ b/paginator.js
@@ -692,7 +692,7 @@ export class Paginator extends HTMLElement {
             if (detail.type !== 'text/css') return
             detail.data = Promise.resolve(detail.data).then(data => data
                 // unprefix as most of the props are (only) supported unprefixed
-                .replace(/(?<=[{\s;])-epub-/gi, '')
+                .replace(/([{\s;])-epub-/gi, '$1')
                 // `page-break-*` unsupported in columns; replace with `column-break-*`
                 .replace(/page-break-(after|before|inside)\s*:/gi, (_, x) =>
                     `-webkit-column-break-${x}:`)

commit 983589f0ff42e7567769570eef367175e7442332
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Mon Nov 24 23:56:12 2025 +0800

    Align PDF center on the page when zoomed out
---
 fixed-layout.js | 7 +++++--
 1 file changed, 5 insertions(+), 2 deletions(-)

diff --git a/fixed-layout.js b/fixed-layout.js
index 480479c..fd963f4 100644
--- a/fixed-layout.js
+++ b/fixed-layout.js
@@ -153,6 +153,7 @@ export class FixedLayout extends HTMLElement {
             if (!iframe) return
             if (onZoom) onZoom({ doc: frame.iframe.contentDocument, scale })
             const iframeScale = onZoom ? scale : 1
+            const zoomedOut = this.#scaleFactor < 1.0
             Object.assign(iframe.style, {
                 width: `${width * iframeScale}px`,
                 height: `${height * iframeScale}px`,
@@ -163,9 +164,11 @@ export class FixedLayout extends HTMLElement {
             Object.assign(element.style, {
                 width: `${(width ?? blankWidth) * scale / this.#scaleFactor}px`,
                 height: `${(height ?? blankHeight) * scale / this.#scaleFactor}px`,
-                display: 'block',
                 flexShrink: '0',
-                marginBlock: 'auto',
+                display: zoomedOut ? 'flex' : 'block',
+                marginBlock: zoomedOut ? undefined : 'auto',
+                alignItems: zoomedOut ? 'center' : undefined,
+                justifyContent: zoomedOut ? 'center' : undefined,
             })
             if (portrait && frame !== target) {
                 element.style.display = 'none'

commit 2941fcc355a90a21ca340438487b49e456867bd2
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Mon Nov 24 21:12:45 2025 +0800

    Support hand tool for panning in PDF
---
 fixed-layout.js |   5 +--
 pdf.js          | 111 ++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 2 files changed, 110 insertions(+), 6 deletions(-)

diff --git a/fixed-layout.js b/fixed-layout.js
index c47a1c0..480479c 100644
--- a/fixed-layout.js
+++ b/fixed-layout.js
@@ -161,9 +161,8 @@ export class FixedLayout extends HTMLElement {
                 display: blank ? 'none' : 'block',
             })
             Object.assign(element.style, {
-                width: `${(width ?? blankWidth) * scale}px`,
-                height: `${(height ?? blankHeight) * scale}px`,
-                overflow: 'hidden',
+                width: `${(width ?? blankWidth) * scale / this.#scaleFactor}px`,
+                height: `${(height ?? blankHeight) * scale / this.#scaleFactor}px`,
                 display: 'block',
                 flexShrink: '0',
                 marginBlock: 'auto',
diff --git a/pdf.js b/pdf.js
index b4a96cf..22624b5 100644
--- a/pdf.js
+++ b/pdf.js
@@ -49,9 +49,114 @@ const render = async (page, doc, zoom) => {
     const endOfContent = document.createElement('div')
     endOfContent.className = 'endOfContent'
     container.append(endOfContent)
-    // TODO: this only works in Firefox; see https://github.com/mozilla/pdf.js/pull/17923
-    container.onpointerdown = () => container.classList.add('selecting')
-    container.onpointerup = () => container.classList.remove('selecting')
+
+    let isPanning = false
+    let startX = 0
+    let startY = 0
+    let scrollLeft = 0
+    let scrollTop = 0
+    let scrollParent = null
+
+    const findScrollableParent = (element) => {
+        let current = element
+        while (current) {
+            if (current !== document.body && current.nodeType === 1) {
+                const style = window.getComputedStyle(current)
+                const overflow = style.overflow + style.overflowY + style.overflowX
+                if (/(auto|scroll)/.test(overflow)) {
+                    if (current.scrollHeight > current.clientHeight ||
+                        current.scrollWidth > current.clientWidth) {
+                        return current
+                    }
+                }
+            }
+            if (current.parentElement) {
+                current = current.parentElement
+            } else if (current.parentNode && current.parentNode.host) {
+                current = current.parentNode.host
+            } else {
+                break
+            }
+        }
+        return window
+    }
+
+    container.onpointerdown = (e) => {
+        const selection = doc.getSelection()
+        const hasTextSelection = selection && selection.toString().length > 0
+
+        const elementUnderCursor = doc.elementFromPoint(e.clientX, e.clientY)
+        const hasTextUnderneath = elementUnderCursor &&
+                             (elementUnderCursor.tagName === 'SPAN' || elementUnderCursor.tagName === 'P') &&
+                             elementUnderCursor.textContent.trim().length > 0
+
+        if (!hasTextUnderneath && !hasTextSelection) {
+            isPanning = true
+            startX = e.screenX
+            startY = e.screenY
+
+            const iframe = doc.defaultView.frameElement
+            if (iframe) {
+                scrollParent = findScrollableParent(iframe)
+                if (scrollParent === window) {
+                    scrollLeft = window.scrollX || window.pageXOffset
+                    scrollTop = window.scrollY || window.pageYOffset
+                } else {
+                    scrollLeft = scrollParent.scrollLeft
+                    scrollTop = scrollParent.scrollTop
+                }
+                container.style.cursor = 'grabbing'
+                e.preventDefault()
+            }
+        } else {
+            container.classList.add('selecting')
+        }
+    }
+
+    container.onpointermove = (e) => {
+        if (isPanning && scrollParent) {
+            e.preventDefault()
+
+            const dx = e.screenX - startX
+            const dy = e.screenY - startY
+
+            if (scrollParent === window) {
+                window.scrollTo(scrollLeft - dx, scrollTop - dy)
+            } else {
+                scrollParent.scrollLeft = scrollLeft - dx
+                scrollParent.scrollTop = scrollTop - dy
+            }
+        }
+    }
+
+    container.onpointerup = () => {
+        if (isPanning) {
+            isPanning = false
+            scrollParent = null
+            container.style.cursor = 'grab'
+        } else {
+            container.classList.remove('selecting')
+        }
+    }
+
+    container.onpointerleave = () => {
+        if (isPanning) {
+            isPanning = false
+            scrollParent = null
+            container.style.cursor = 'grab'
+        }
+    }
+
+    doc.addEventListener('selectionchange', () => {
+        const selection = doc.getSelection()
+        if (selection && selection.toString().length > 0) {
+            container.style.cursor = 'text'
+        } else if (!isPanning) {
+            container.style.cursor = 'grab'
+        }
+    })
+
+    container.style.cursor = 'grab'
 
     const div = doc.querySelector('.annotationLayer')
     await new pdfjsLib.AnnotationLayer({ page, viewport, div }).render({

commit 260ae08e7be211bba65897049a3c29636b6beedd
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Thu Nov 20 00:40:18 2025 +0800

    Add available height var for page
---
 paginator.js | 6 ++++--
 1 file changed, 4 insertions(+), 2 deletions(-)

diff --git a/paginator.js b/paginator.js
index 13a76d8..d86f6b7 100644
--- a/paginator.js
+++ b/paginator.js
@@ -305,9 +305,10 @@ class View {
                 ? `${marginTop}px ${gap}px ${marginBottom}px ${gap}px`
                 : `0px ${gap / 2 + marginRight}px 0px ${gap / 2 + marginLeft}px`,
             'column-width': 'auto',
-            '--available-width': `${Math.trunc(Math.min(window.innerWidth, columnWidth) - marginLeft - marginRight - gap - 60)}`,
             'height': 'auto',
             'width': 'auto',
+            '--available-width': `${Math.trunc(Math.min(window.innerWidth, columnWidth) - marginLeft - marginRight - gap - 60)}`,
+            '--available-height': `${Math.trunc(window.innerHeight - marginTop - marginBottom)}`,
         })
         setStylesImportant(doc.body, {
             [vertical ? 'max-height' : 'max-width']: `${columnWidth}px`,
@@ -324,7 +325,6 @@ class View {
         setStylesImportant(doc.documentElement, {
             'box-sizing': 'border-box',
             'column-width': `${Math.trunc(columnWidth)}px`,
-            '--available-width': `${Math.trunc(columnWidth - marginLeft - marginRight - gap)}`,
             'column-gap': vertical ? `${(marginTop + marginBottom) * 1.5}px` : `${gap + marginRight / 2 + marginLeft / 2}px`,
             'column-fill': 'auto',
             ...(vertical
@@ -342,6 +342,8 @@ class View {
             'min-height': 'none', 'min-width': 'none',
             // fix glyph clipping in WebKit
             '-webkit-line-box-contain': 'block glyphs replaced',
+            '--available-width': `${Math.trunc(columnWidth - marginLeft - marginRight - gap)}`,
+            '--available-height': `${Math.trunc(height - marginTop - marginBottom)}`,
         })
         setStylesImportant(doc.body, {
             'max-height': 'none',

commit 18fb2e7a47f3acf79550b2e9d9f76f27fdcf1de6
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Mon Nov 17 11:36:14 2025 +0800

    Add available width var for page
---
 paginator.js | 2 ++
 1 file changed, 2 insertions(+)

diff --git a/paginator.js b/paginator.js
index ffd8ef9..13a76d8 100644
--- a/paginator.js
+++ b/paginator.js
@@ -305,6 +305,7 @@ class View {
                 ? `${marginTop}px ${gap}px ${marginBottom}px ${gap}px`
                 : `0px ${gap / 2 + marginRight}px 0px ${gap / 2 + marginLeft}px`,
             'column-width': 'auto',
+            '--available-width': `${Math.trunc(Math.min(window.innerWidth, columnWidth) - marginLeft - marginRight - gap - 60)}`,
             'height': 'auto',
             'width': 'auto',
         })
@@ -323,6 +324,7 @@ class View {
         setStylesImportant(doc.documentElement, {
             'box-sizing': 'border-box',
             'column-width': `${Math.trunc(columnWidth)}px`,
+            '--available-width': `${Math.trunc(columnWidth - marginLeft - marginRight - gap)}`,
             'column-gap': vertical ? `${(marginTop + marginBottom) * 1.5}px` : `${gap + marginRight / 2 + marginLeft / 2}px`,
             'column-fill': 'auto',
             ...(vertical

commit 73564ec82df7a644f0dc57849e0ce7b28aa9e550
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sun Nov 2 14:33:04 2025 +0800

    Fine tuning of column width for vertical mode
---
 paginator.js | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

diff --git a/paginator.js b/paginator.js
index 9e0bbd6..ffd8ef9 100644
--- a/paginator.js
+++ b/paginator.js
@@ -787,7 +787,7 @@ export class Paginator extends HTMLElement {
             return { flow, marginTop, marginRight, marginBottom, marginLeft, gap: g * size, columnWidth }
         }
 
-        const divisor = Math.min(maxColumnCount, Math.ceil(size / maxInlineSize))
+        const divisor = Math.min(maxColumnCount + (vertical ? 1 : 0), Math.ceil(size / maxInlineSize))
         const columnWidth = vertical
             ? (size / divisor - (marginTop + marginBottom) / 2)
             : (size / divisor - gap - marginRight / 2 - marginLeft / 2)

commit 22554ea3d737066053b0b3be694459a06edfd399
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sat Nov 1 21:15:19 2025 +0800

    Make container fullscreen to support full-bleed layout
---
 paginator.js | 11 ++++-------
 1 file changed, 4 insertions(+), 7 deletions(-)

diff --git a/paginator.js b/paginator.js
index f170050..9e0bbd6 100644
--- a/paginator.js
+++ b/paginator.js
@@ -323,14 +323,14 @@ class View {
         setStylesImportant(doc.documentElement, {
             'box-sizing': 'border-box',
             'column-width': `${Math.trunc(columnWidth)}px`,
-            'column-gap': vertical ? `${(marginTop + marginBottom) / 2}px` : `${gap + marginRight / 2 + marginLeft / 2}px`,
+            'column-gap': vertical ? `${(marginTop + marginBottom) * 1.5}px` : `${gap + marginRight / 2 + marginLeft / 2}px`,
             'column-fill': 'auto',
             ...(vertical
                 ? { 'width': `${width}px` }
                 : { 'height': `${height}px` }),
             'padding': vertical
-                ? `${marginTop / 2}px ${marginRight}px ${marginBottom / 2}px ${marginLeft}px`
-                : `0px ${gap / 2 + marginRight / 2}px 0px ${gap / 2 + marginLeft / 2}px`,
+                ? `${marginTop * 1.5}px ${marginRight}px ${marginBottom * 1.5}px ${marginLeft}px`
+                : `${marginTop}px ${gap / 2 + marginRight / 2}px ${marginBottom}px ${gap / 2 + marginLeft / 2}px`,
             'overflow': 'hidden',
             // force wrap long words
             'overflow-wrap': 'break-word',
@@ -530,7 +530,7 @@ export class Paginator extends HTMLElement {
         }
         #container {
             grid-column: 2 / 5;
-            grid-row: 2;
+            grid-row: 1 / -1;
             overflow: hidden;
         }
         :host([flow="scrolled"]) #container {
@@ -723,9 +723,6 @@ export class Paginator extends HTMLElement {
             }
             background = parsedBackground.join(' ')
         }
-        if (/cover.*fixed|fixed.*cover/.test(background)) {
-            background = background.replace('cover', 'auto 100%').replace('fixed', '')
-        }
         this.#background.innerHTML = ''
         this.#background.style.display = 'grid'
         this.#background.style.gridTemplateColumns = `repeat(${columnCount}, 1fr)`

commit 8dd3c9b36504992a28483f53e12024e8819f5faa
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Fri Oct 31 12:06:47 2025 +0800

    If the publisher has already been parsed, don’t remap it from the author or contributor fields again.
    This prevents failures when parsing metadata like <dc:creator opf:role="pbl" />.
---
 epub.js | 5 ++++-
 1 file changed, 4 insertions(+), 1 deletion(-)

diff --git a/epub.js b/epub.js
index d3158ec..39ae510 100644
--- a/epub.js
+++ b/epub.js
@@ -294,9 +294,12 @@ const getMetadata = opf => {
     for (const [keys, val] of [].concat(
         dc.creator?.map(makeContributor)?.map(remapContributor('author')) ?? [],
         dc.contributor?.map(makeContributor)?.map(remapContributor('contributor')) ?? []))
-        for (const key of keys)
+        for (const key of keys) {
+            // if already parsed publisher don't remap it from author/contributor again
+            if (key === 'publisher' && metadata.publisher) continue
             if (metadata[key]) metadata[key].push(val)
             else metadata[key] = [val]
+        }
     tidy(metadata)
     if (metadata.altIdentifier === metadata.identifier)
         delete metadata.altIdentifier

commit a3a127151dbe3f75b06c99bb0c051c039c2b1f50
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Fri Oct 31 01:36:44 2025 +0800

    Support overriding background color
---
 paginator.js | 3 ++-
 1 file changed, 2 insertions(+), 1 deletion(-)

diff --git a/paginator.js b/paginator.js
index 1f3ac52..f170050 100644
--- a/paginator.js
+++ b/paginator.js
@@ -713,11 +713,12 @@ export class Paginator extends HTMLElement {
         if (!doc) return
         const htmlStyle = doc.defaultView.getComputedStyle(doc.documentElement)
         const themeBgColor = htmlStyle.getPropertyValue('--theme-bg-color')
+        const overrideColor = htmlStyle.getPropertyValue('--override-color') === 'true'
         const bgTextureId = htmlStyle.getPropertyValue('--bg-texture-id')
         const isDarkMode = htmlStyle.getPropertyValue('color-scheme') === 'dark'
         if (background && themeBgColor) {
             const parsedBackground = background.split(/\s(?=(?:url|rgb|hsl|#[0-9a-fA-F]{3,6}))/)
-            if (isDarkMode && (bgTextureId === 'none' || !bgTextureId)) {
+            if ((isDarkMode || overrideColor) && (bgTextureId === 'none' || !bgTextureId)) {
                 parsedBackground[0] = themeBgColor
             }
             background = parsedBackground.join(' ')

commit 25b4bc51947fb0e6bbb9c7184019f5a789f04e52
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Mon Oct 20 15:58:00 2025 +0800

    Supported footnotes for definition list
---
 footnotes.js | 10 ++++++++++
 paginator.js |  2 +-
 2 files changed, 11 insertions(+), 1 deletion(-)

diff --git a/footnotes.js b/footnotes.js
index 5c09eeb..a7bc11b 100644
--- a/footnotes.js
+++ b/footnotes.js
@@ -71,6 +71,16 @@ export class FootnoteHandler extends EventTarget {
                         } else if (el.matches('li, aside')) {
                             range = doc.createRange()
                             range.selectNodeContents(el)
+                        } else if (el.matches('dt')) {
+                            range = doc.createRange()
+                            range.setStartBefore(el)
+                            let sibling = el.nextElementSibling
+                            let lastDD = null
+                            while (sibling && sibling.matches('dd')) {
+                                lastDD = sibling
+                                sibling = sibling.nextElementSibling
+                            }
+                            range.setEndAfter(lastDD || el)
                         } else if (el.closest('li')) {
                             range = doc.createRange()
                             range.selectNodeContents(el.closest('li'))
diff --git a/paginator.js b/paginator.js
index 21ebefb..1f3ac52 100644
--- a/paginator.js
+++ b/paginator.js
@@ -165,7 +165,7 @@ const setSelectionTo = (target, collapse) => {
         range.selectNode(target)
     }
     if (range) {
-        const sel = range.startContainer.ownerDocument.defaultView.getSelection()
+        const sel = range.startContainer.ownerDocument?.defaultView.getSelection()
         if (sel) {
             sel.removeAllRanges()
             if (collapse === -1) range.collapse(true)

commit d0eeb793d769c9435b83d4762e17c57f122c878c
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Fri Oct 17 23:48:56 2025 +0800

    Disable page sliding in eink mode
---
 paginator.js | 9 ++++++---
 1 file changed, 6 insertions(+), 3 deletions(-)

diff --git a/paginator.js b/paginator.js
index ce61816..21ebefb 100644
--- a/paginator.js
+++ b/paginator.js
@@ -904,6 +904,7 @@ export class Paginator extends HTMLElement {
             x: touch?.screenX, y: touch?.screenY,
             t: e.timeStamp,
             vx: 0, xy: 0,
+            dx: 0, dy: 0,
         }
     }
     #onTouchMove(e) {
@@ -931,10 +932,12 @@ export class Paginator extends HTMLElement {
         state.t = e.timeStamp
         state.vx = dx / dt
         state.vy = dy / dt
+        state.dx += dx
+        state.dy += dy
         this.#touchScrolled = true
-        if (Math.abs(dx) >= Math.abs(dy) && (!isStylus || Math.abs(dx) > 1)) {
+        if (!this.#vertical && Math.abs(state.dx) >= Math.abs(state.dy) && !this.hasAttribute('eink') && (!isStylus || Math.abs(dx) > 1)) {
             this.scrollBy(dx, 0)
-        } else if (Math.abs(dy) > Math.abs(dx) && (!isStylus || Math.abs(dy) > 1)) {
+        } else if (this.#vertical && Math.abs(state.dx) < Math.abs(state.dy) && !this.hasAttribute('eink') && (!isStylus || Math.abs(dy) > 1)) {
             this.scrollBy(0, dy)
         }
     }
@@ -987,7 +990,7 @@ export class Paginator extends HTMLElement {
         }
         // FIXME: vertical-rl only, not -lr
         if (this.scrolled && this.#vertical) offset = -offset
-        if ((reason === 'snap' || smooth) && this.hasAttribute('animated')) return animate(
+        if ((reason === 'snap' || smooth) && this.hasAttribute('animated') && !this.hasAttribute('eink')) return animate(
             this.containerPosition, offset, 300, easeOutQuad,
             x => this.containerPosition = x,
         ).then(() => {

commit e37106dcfb8e4cae0db8231b5efdc70a15c12660
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Fri Oct 17 22:03:24 2025 +0800

    More sensitive snap to paginate
---
 paginator.js | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)

diff --git a/paginator.js b/paginator.js
index d04243a..ce61816 100644
--- a/paginator.js
+++ b/paginator.js
@@ -879,7 +879,7 @@ export class Paginator extends HTMLElement {
 
     snap(vx, vy) {
         const velocity = this.#vertical ? vy : vx
-        const horizontal = Math.abs(vx) > Math.abs(vy)
+        const horizontal = Math.abs(vx) * 2 > Math.abs(vy)
         const orthogonal = this.#vertical ? !horizontal : horizontal
         const [offset, a, b] = this.#scrollBounds
         const { start, end, pages, size } = this
@@ -888,7 +888,7 @@ export class Paginator extends HTMLElement {
         const d = velocity * (this.#rtl ? -size : size) * (orthogonal ? 1 : 0)
         const page = Math.floor(
             Math.max(min, Math.min(max, (start + end) / 2
-                + (isNaN(d) ? 0 : d))) / size)
+                + (isNaN(d) ? 0 : d * 2))) / size)
 
         this.#scrollToPage(page, 'snap').then(() => {
             const dir = page <= 0 ? -1 : page >= pages - 1 ? 1 : null

commit 0f0648101583b9f2dd94c487b2cefff02d6a0dcb
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Wed Oct 15 17:57:57 2025 +0800

    Parse footnotes with only anchors
---
 footnotes.js | 13 +++++++++++++
 1 file changed, 13 insertions(+)

diff --git a/footnotes.js b/footnotes.js
index 3167ba1..5c09eeb 100644
--- a/footnotes.js
+++ b/footnotes.js
@@ -77,6 +77,19 @@ export class FootnoteHandler extends EventTarget {
                         } else if (el.closest('.note')) {
                             range = doc.createRange()
                             range.selectNodeContents(el.closest('.note'))
+                        } else if (el.querySelector('a')) {
+                            range = doc.createRange()
+                            range.setStartBefore(el)
+                            let next = el.nextElementSibling
+                            while (next) {
+                                if (next.querySelector('a')) break
+                                next = next.nextElementSibling
+                            }
+                            if (next) {
+                                range.setEndBefore(next)
+                            } else {
+                                range.setEndAfter(el.parentNode.lastChild)
+                            }
                         } else {
                             range = doc.createRange()
                             const hasContent = el.textContent?.trim() || el.children.length > 0

commit 508eb889a36b6d7c98e12d374a50ae99dc798c25
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Mon Oct 13 18:48:35 2025 +0800

    Support background texture in dark mode
---
 paginator.js | 3 ++-
 1 file changed, 2 insertions(+), 1 deletion(-)

diff --git a/paginator.js b/paginator.js
index aaf1fdb..d04243a 100644
--- a/paginator.js
+++ b/paginator.js
@@ -713,10 +713,11 @@ export class Paginator extends HTMLElement {
         if (!doc) return
         const htmlStyle = doc.defaultView.getComputedStyle(doc.documentElement)
         const themeBgColor = htmlStyle.getPropertyValue('--theme-bg-color')
+        const bgTextureId = htmlStyle.getPropertyValue('--bg-texture-id')
         const isDarkMode = htmlStyle.getPropertyValue('color-scheme') === 'dark'
         if (background && themeBgColor) {
             const parsedBackground = background.split(/\s(?=(?:url|rgb|hsl|#[0-9a-fA-F]{3,6}))/)
-            if (isDarkMode) {
+            if (isDarkMode && (bgTextureId === 'none' || !bgTextureId)) {
                 parsedBackground[0] = themeBgColor
             }
             background = parsedBackground.join(' ')

commit 1ea38435658bf3addaa6f44527a6d9aa1e186aba
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Wed Sep 17 23:41:44 2025 +0800

    a11y: focus the element when navigating with keyboard or screen reader
---
 paginator.js | 23 +++++++++++++----------
 1 file changed, 13 insertions(+), 10 deletions(-)

diff --git a/paginator.js b/paginator.js
index 6ed74cb..aaf1fdb 100644
--- a/paginator.js
+++ b/paginator.js
@@ -1017,17 +1017,20 @@ export class Paginator extends HTMLElement {
                 .find(r => r.width > 0 && r.height > 0) || rects[0]
             if (!rect) return
             await this.#scrollToRect(rect, reason)
-            let node = anchor.focus ? anchor : undefined
-            if (!node && anchor.startContainer) {
-                node = anchor.startContainer
-                if (node.nodeType === Node.TEXT_NODE) {
-                    node = node.parentElement
+            // focus the element when navigating with keyboard or screen reader
+            if (reason === 'navigation') {
+                let node = anchor.focus ? anchor : undefined
+                if (!node && anchor.startContainer) {
+                    node = anchor.startContainer
+                    if (node.nodeType === Node.TEXT_NODE) {
+                        node = node.parentElement
+                    }
+                }
+                if (node && node.focus) {
+                    node.tabIndex = -1
+                    node.style.outline = 'none'
+                    node.focus({ preventScroll: true })
                 }
-            }
-            if (node && node.focus) {
-                node.tabIndex = -1
-                node.style.outline = 'none'
-                node.focus({ preventScroll: true })
             }
             return
         }

commit f03d592a4c95cf4ecc771ecce7f5324f5b414624
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Wed Sep 17 09:52:58 2025 +0800

    Prevent destructuring error on some old Safari
---
 paginator.js | 1 +
 1 file changed, 1 insertion(+)

diff --git a/paginator.js b/paginator.js
index 89f6219..6ed74cb 100644
--- a/paginator.js
+++ b/paginator.js
@@ -378,6 +378,7 @@ class View {
         return 1.0
     }
     expand() {
+        if (!this.document) return
         const { documentElement } = this.document
         if (this.#column) {
             const side = this.#vertical ? 'height' : 'width'

commit 1bf193770c7fe5f10b145347f0ad6f0e53c87d41
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Tue Sep 16 23:12:31 2025 +0800

    a11y: focus anchor for aria navigation
---
 paginator.js | 13 +++++++++++++
 1 file changed, 13 insertions(+)

diff --git a/paginator.js b/paginator.js
index 16f616e..89f6219 100644
--- a/paginator.js
+++ b/paginator.js
@@ -257,6 +257,7 @@ class View {
                 const doc = this.document
                 afterLoad?.(doc)
 
+                this.#iframe.setAttribute('aria-label', doc.title)
                 // it needs to be visible for Firefox to get computed style
                 this.#iframe.style.display = 'block'
                 const { vertical, rtl } = getDirection(doc)
@@ -1015,6 +1016,18 @@ export class Paginator extends HTMLElement {
                 .find(r => r.width > 0 && r.height > 0) || rects[0]
             if (!rect) return
             await this.#scrollToRect(rect, reason)
+            let node = anchor.focus ? anchor : undefined
+            if (!node && anchor.startContainer) {
+                node = anchor.startContainer
+                if (node.nodeType === Node.TEXT_NODE) {
+                    node = node.parentElement
+                }
+            }
+            if (node && node.focus) {
+                node.tabIndex = -1
+                node.style.outline = 'none'
+                node.focus({ preventScroll: true })
+            }
             return
         }
         // if anchor is a fraction

commit fcfdd20cad585b23c46da17aee8f7e9677a8b1fa
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sat Sep 6 22:03:12 2025 +0800

    Fixed zoom level handling on Safari WebKit
---
 paginator.js | 9 ++++++++-
 1 file changed, 8 insertions(+), 1 deletion(-)

diff --git a/paginator.js b/paginator.js
index 46aed6d..16f616e 100644
--- a/paginator.js
+++ b/paginator.js
@@ -369,6 +369,13 @@ class View {
             })
         }
     }
+    get #zoom() {
+        // Safari does not zoom the client rects, while Chrome, Edge and Firefox does
+        if (/^((?!chrome|android).)*AppleWebKit/i.test(navigator.userAgent) && !window.chrome) {
+            return window.getComputedStyle(this.document.body).zoom || 1.0
+        }
+        return 1.0
+    }
     expand() {
         const { documentElement } = this.document
         if (this.#column) {
@@ -380,7 +387,7 @@ class View {
             // which seem to be supported only by WebKit and only for horizontal writing
             const contentStart = this.#vertical ? 0
                 : this.#rtl ? rootRect.right - contentRect.right : contentRect.left - rootRect.left
-            const contentSize = contentStart + contentRect[side]
+            const contentSize = (contentStart + contentRect[side]) * this.#zoom
             const pageCount = Math.ceil(contentSize / this.#size)
             const expandedSize = pageCount * this.#size
             this.#element.style.padding = '0'

commit aa04e0123a8b1d6c91cfdffde641d5184df41357
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sat Sep 6 00:54:43 2025 +0800

    More accessible iframes for PDF documents
---
 fixed-layout.js | 9 +++++++--
 pdf.js          | 7 ++++---
 2 files changed, 11 insertions(+), 5 deletions(-)

diff --git a/fixed-layout.js b/fixed-layout.js
index dbc3a54..c47a1c0 100644
--- a/fixed-layout.js
+++ b/fixed-layout.js
@@ -33,7 +33,7 @@ const getViewport = (doc, viewport) => {
 
 export class FixedLayout extends HTMLElement {
     static observedAttributes = ['zoom', 'scale-factor', 'spread']
-    #root = this.attachShadow({ mode: 'closed' })
+    #root = this.attachShadow({ mode: 'open' })
     #observer = new ResizeObserver(() => this.#render())
     #spreads
     #index = -1
@@ -81,6 +81,7 @@ export class FixedLayout extends HTMLElement {
     async #createFrame({ index, src: srcOption }) {
         const srcOptionIsString = typeof srcOption === 'string'
         const src = srcOptionIsString ? srcOption : srcOption?.src
+        const data = srcOptionIsString ? null : srcOption?.data
         const onZoom = srcOptionIsString ? null : srcOption?.onZoom
         const element = document.createElement('div')
         element.setAttribute('dir', 'ltr')
@@ -110,7 +111,11 @@ export class FixedLayout extends HTMLElement {
                     onZoom,
                 })
             }, { once: true })
-            iframe.src = src
+            if (data) {
+                iframe.srcdoc = data
+            } else {
+                iframe.src = src
+            }
         })
     }
     #render(side = this.#side) {
diff --git a/pdf.js b/pdf.js
index 2668991..b4a96cf 100644
--- a/pdf.js
+++ b/pdf.js
@@ -82,7 +82,7 @@ const renderPage = async (page, getImageBlob) => {
     if (annotationLayerBuilderCSS == null) {
         annotationLayerBuilderCSS = await fetchText(pdfjsPath('annotation_layer_builder.css'))
     }
-    const src = URL.createObjectURL(new Blob([`
+    const data = `
         <!DOCTYPE html>
         <html lang="en">
         <meta charset="utf-8">
@@ -98,9 +98,10 @@ const renderPage = async (page, getImageBlob) => {
         <div id="canvas"></div>
         <div class="textLayer"></div>
         <div class="annotationLayer"></div>
-    `], { type: 'text/html' }))
+    `
+    const src = URL.createObjectURL(new Blob([data], { type: 'text/html' }))
     const onZoom = ({ doc, scale }) => render(page, doc, scale)
-    return { src, onZoom }
+    return { src, data, onZoom }
 }
 
 const makeTOCItem = item => ({

commit 9c2b1faf320616bcb64035ada713403d75424076
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sat Sep 6 00:10:02 2025 +0800

    Added scale-factor and spread props for PDF
---
 fixed-layout.js | 37 +++++++++++++++++++++++++++++--------
 1 file changed, 29 insertions(+), 8 deletions(-)

diff --git a/fixed-layout.js b/fixed-layout.js
index 195004b..dbc3a54 100644
--- a/fixed-layout.js
+++ b/fixed-layout.js
@@ -32,7 +32,7 @@ const getViewport = (doc, viewport) => {
 }
 
 export class FixedLayout extends HTMLElement {
-    static observedAttributes = ['zoom']
+    static observedAttributes = ['zoom', 'scale-factor', 'spread']
     #root = this.attachShadow({ mode: 'closed' })
     #observer = new ResizeObserver(() => this.#render())
     #spreads
@@ -45,6 +45,7 @@ export class FixedLayout extends HTMLElement {
     #center
     #side
     #zoom
+    #scaleFactor = 1.0
     constructor() {
         super()
 
@@ -68,6 +69,13 @@ export class FixedLayout extends HTMLElement {
                     ? parseFloat(value) : value
                 this.#render()
                 break
+            case 'scale-factor':
+                this.#scaleFactor = parseFloat(value) / 100
+                this.#render()
+                break
+            case 'spread':
+                this.#respread(value)
+                break
         }
     }
     async #createFrame({ index, src: srcOption }) {
@@ -117,7 +125,7 @@ export class FixedLayout extends HTMLElement {
         const blankWidth = left.width ?? right.width ?? 0
         const blankHeight = left.height ?? right.height ?? 0
 
-        const scale = typeof this.#zoom === 'number' && !isNaN(this.#zoom)
+        let scale = typeof this.#zoom === 'number' && !isNaN(this.#zoom)
             ? this.#zoom
             : (this.#zoom === 'fit-width'
                 ? (portrait || this.#center
@@ -133,6 +141,7 @@ export class FixedLayout extends HTMLElement {
                             left.height ?? blankHeight,
                             right.height ?? blankHeight)))
             ) || 1
+        scale *= this.#scaleFactor
 
         const transform = frame => {
             let { element, iframe, width, height, blank, onZoom } = frame
@@ -202,15 +211,19 @@ export class FixedLayout extends HTMLElement {
     }
     open(book) {
         this.book = book
-        const { rendition } = book
-        this.spread = rendition?.spread
-        this.defaultViewport = rendition?.viewport
+        this.defaultViewport = book.rendition?.viewport
+        this.rtl = book.dir === 'rtl'
 
-        const rtl = book.dir === 'rtl'
+        this.#spread()
+    }
+    #spread(mode) {
+        const book = this.book
+        const { rendition } = book
+        const rtl = this.rtl
         const ltr = !rtl
-        this.rtl = rtl
+        this.spread = mode || rendition?.spread
 
-        if (rendition?.spread === 'none')
+        if (this.spread === 'none')
             this.#spreads = book.sections.map(section => ({ center: section }))
         else this.#spreads = book.sections.reduce((arr, section, i) => {
             const last = arr[arr.length - 1]
@@ -245,6 +258,14 @@ export class FixedLayout extends HTMLElement {
             return arr
         }, [{}])
     }
+    #respread(spreadMode) {
+        if (this.#index === -1) return
+        const section = this.book.sections[this.index]
+        this.#spread(spreadMode)
+        const { index } = this.getSpreadOf(section)
+        this.#index = -1
+        this.goToSpread(index, this.rtl ? 'right' : 'left', 'page')
+    }
     get index() {
         const spread = this.#spreads[this.#index]
         const section = spread?.center ?? (this.#side === 'left'

commit 26b6df4f0659f2cc6d2cd079ef535d3dd3be5878
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Fri Sep 5 16:25:13 2025 +0800

    Added prevMark/nextMark for TTS
---
 tts.js | 69 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 69 insertions(+)

diff --git a/tts.js b/tts.js
index 54df0ef..75fe327 100644
--- a/tts.js
+++ b/tts.js
@@ -279,6 +279,75 @@ export class TTS {
         if (paused && range) this.highlight(range.cloneRange())
         return this.#speak(doc)
     }
+    prevMark(paused) {
+        const marks = Array.from(this.#ranges.keys())
+        if (marks.length === 0) return
+
+        const currentIndex = this.#lastMark ? marks.indexOf(this.#lastMark) : -1
+        if (currentIndex > 0) {
+            const prevMarkName = marks[currentIndex - 1]
+            const range = this.#ranges.get(prevMarkName)
+            if (range) {
+                this.#lastMark = prevMarkName
+                if (paused) this.highlight(range.cloneRange())
+
+                const [doc] = this.#list.current() ?? []
+                return this.#speak(doc, ssml => this.#getMarkElement(ssml, prevMarkName))
+            }
+        } else {
+            const [doc, range] = this.#list.prev() ?? []
+            if (doc && range) {
+                const prevMarks = Array.from(this.#ranges.keys())
+                if (prevMarks.length > 0) {
+                    const lastMarkName = prevMarks[prevMarks.length - 1]
+                    const lastMarkRange = this.#ranges.get(lastMarkName)
+                    if (lastMarkRange) {
+                        this.#lastMark = lastMarkName
+                        if (paused) this.highlight(lastMarkRange.cloneRange())
+                        return this.#speak(doc, ssml => this.#getMarkElement(ssml, lastMarkName))
+                    }
+                } else {
+                    this.#lastMark = null
+                    if (paused) this.highlight(range.cloneRange())
+                    return this.#speak(doc)
+                }
+            }
+        }
+    }
+    nextMark(paused) {
+        const marks = Array.from(this.#ranges.keys())
+        if (marks.length === 0) return
+
+        const currentIndex = this.#lastMark ? marks.indexOf(this.#lastMark) : -1
+        if (currentIndex >= 0 && currentIndex < marks.length - 1) {
+            const nextMarkName = marks[currentIndex + 1]
+            const range = this.#ranges.get(nextMarkName)
+            if (range) {
+                this.#lastMark = nextMarkName
+                if (paused) this.highlight(range.cloneRange())
+                const [doc] = this.#list.current() ?? []
+                return this.#speak(doc, ssml => this.#getMarkElement(ssml, nextMarkName))
+            }
+        } else {
+            const [doc, range] = this.#list.next() ?? []
+            if (doc && range) {
+                const nextMarks = Array.from(this.#ranges.keys())
+                if (nextMarks.length > 0) {
+                    const firstMarkName = nextMarks[0]
+                    const firstMarkRange = this.#ranges.get(firstMarkName)
+                    if (firstMarkRange) {
+                        this.#lastMark = firstMarkName
+                        if (paused) this.highlight(firstMarkRange.cloneRange())
+                        return this.#speak(doc, ssml => this.#getMarkElement(ssml, firstMarkName))
+                    }
+                } else {
+                    this.#lastMark = null
+                    if (paused) this.highlight(range.cloneRange())
+                    return this.#speak(doc)
+                }
+            }
+        }
+    }
     from(range) {
         this.#lastMark = null
         const [doc] = this.#list.find(range_ =>

commit 920676bd6b753042806c28c24f0956c99a2df243
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Wed Sep 3 22:31:58 2025 +0800

    Also highlight heading tags within ranges
---
 overlayer.js | 5 ++---
 1 file changed, 2 insertions(+), 3 deletions(-)

diff --git a/overlayer.js b/overlayer.js
index 86be1a6..6b85373 100644
--- a/overlayer.js
+++ b/overlayer.js
@@ -25,8 +25,7 @@ export class Overlayer {
     }
     #splitRangeByParagraph(range) {
         const ancestor = range.commonAncestorContainer
-        const paragraphs = Array.from(ancestor.querySelectorAll?.('p') || [])
-        if (paragraphs.length === 0) return [range]
+        const paragraphs = Array.from(ancestor.querySelectorAll?.('p, h1, h2, h3, h4') || [])
 
         const splitRanges = []
         paragraphs.forEach((p) => {
@@ -42,7 +41,7 @@ export class Overlayer {
                 splitRanges.push(pRange)
             }
         })
-        return splitRanges
+        return splitRanges.length === 0 ? [range] : splitRanges
     }
     add(key, range, draw, options) {
         if (this.#map.has(key)) this.remove(key)

commit d5c581c3544faf7242c7100a56d25703c16b949d
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Wed Sep 3 13:46:54 2025 +0800

    Parse book front cover with higher priority than the back cover
---
 epub.js | 2 ++
 1 file changed, 2 insertions(+)

diff --git a/epub.js b/epub.js
index 40c07d1..d3158ec 100644
--- a/epub.js
+++ b/epub.js
@@ -686,6 +686,8 @@ class Resources {
             ?? this.getItemByID($$$(opf, 'meta')
                 .find(filterAttribute('name', 'cover'))
                 ?.getAttribute('content'))
+            ?? this.manifest.find(item => item.id === 'cover'
+                && item.mediaType.startsWith('image'))
             ?? this.manifest.find(item => item.href.includes('cover')
                 && item.mediaType.startsWith('image'))
             ?? this.getItemByHref(this.guide

commit d66f12637c73026e4e81b56321808ed52019d35a
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Wed Sep 3 00:48:29 2025 +0800

    Fixed insensitive text selection with stylus
---
 paginator.js | 7 ++++---
 1 file changed, 4 insertions(+), 3 deletions(-)

diff --git a/paginator.js b/paginator.js
index 44f77e3..46aed6d 100644
--- a/paginator.js
+++ b/paginator.js
@@ -910,8 +910,9 @@ export class Paginator extends HTMLElement {
         if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
             return
         }
-        e.preventDefault()
         const touch = e.changedTouches[0]
+        const isStylus = touch.touchType === 'stylus'
+        if (!isStylus) e.preventDefault()
         const x = touch.screenX, y = touch.screenY
         const dx = state.x - x, dy = state.y - y
         const dt = e.timeStamp - state.t
@@ -921,9 +922,9 @@ export class Paginator extends HTMLElement {
         state.vx = dx / dt
         state.vy = dy / dt
         this.#touchScrolled = true
-        if (Math.abs(dx) >= Math.abs(dy)) {
+        if (Math.abs(dx) >= Math.abs(dy) && (!isStylus || Math.abs(dx) > 1)) {
             this.scrollBy(dx, 0)
-        } else if (Math.abs(dy) > Math.abs(dx)) {
+        } else if (Math.abs(dy) > Math.abs(dx) && (!isStylus || Math.abs(dy) > 1)) {
             this.scrollBy(0, dy)
         }
     }

commit 40e391ecf53265beb6eaf96751f5f748e77b73ff
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sat Aug 23 16:25:17 2025 +0800

    Handle some cases where footnote is empty
---
 footnotes.js | 10 +++++++++-
 1 file changed, 9 insertions(+), 1 deletion(-)

diff --git a/footnotes.js b/footnotes.js
index ca424d0..3167ba1 100644
--- a/footnotes.js
+++ b/footnotes.js
@@ -74,9 +74,17 @@ export class FootnoteHandler extends EventTarget {
                         } else if (el.closest('li')) {
                             range = doc.createRange()
                             range.selectNodeContents(el.closest('li'))
+                        } else if (el.closest('.note')) {
+                            range = doc.createRange()
+                            range.selectNodeContents(el.closest('.note'))
                         } else {
                             range = doc.createRange()
-                            range.selectNode(el)
+                            const hasContent = el.textContent?.trim() || el.children.length > 0
+                            if (!hasContent && el.parentElement) {
+                                range.selectNodeContents(el.parentElement)
+                            } else {
+                                range.selectNode(el)
+                            }
                         }
                         const frag = range.extractContents()
                         doc.body.replaceChildren()

commit 4f05eeb6e36ebb19ce19cb503a479aeceb3dd6d4
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Thu Aug 14 22:52:38 2025 +0800

    Tolerance threshold for snap pagination
---
 paginator.js | 4 +++-
 1 file changed, 3 insertions(+), 1 deletion(-)

diff --git a/paginator.js b/paginator.js
index ae9d39f..44f77e3 100644
--- a/paginator.js
+++ b/paginator.js
@@ -869,11 +869,13 @@ export class Paginator extends HTMLElement {
 
     snap(vx, vy) {
         const velocity = this.#vertical ? vy : vx
+        const horizontal = Math.abs(vx) > Math.abs(vy)
+        const orthogonal = this.#vertical ? !horizontal : horizontal
         const [offset, a, b] = this.#scrollBounds
         const { start, end, pages, size } = this
         const min = Math.abs(offset) - a
         const max = Math.abs(offset) + b
-        const d = velocity * (this.#rtl ? -size : size)
+        const d = velocity * (this.#rtl ? -size : size) * (orthogonal ? 1 : 0)
         const page = Math.floor(
             Math.max(min, Math.min(max, (start + end) / 2
                 + (isNaN(d) ? 0 : d))) / size)

commit f087826b6df32d3f4f69dd279ad320926975e0af
Author: chrox <chrox.huang@gmail.com>
Date:   Wed Oct 30 14:57:34 2024 +0100

    Several patches to support older version of browser
    1. Avoid the use of Lookbehind regex which is not supported on WebKit version below 614.3.7.1.5;
    2. Polyfill CSSStyleSheet constructor which is not supported on WebKit version below 615.1.26.11.22;
    3. Avoid the use of module top-level await which is not supported on WebKit version below 613.3.9.1.16;
    4. Use legacy build of pdfjs instead of the bundled pdfjs in the vendor directory:
      * Web Workers loading scripts in pdfjsPath now from the base / that's the public directory of a Next.js project;
      * Use @pdfjs instead of hard coding dist files path of pdfjs so that we can alias @pdfjs to the public directory;
    5. Dismiss iframe background since it's replaced with a root background also scale background size;
    6. Support specific cases where the cover is not included in the meta or guide sections;
    7. Make sync pre/next possible in TTS;
    8. Fix scrolling when selecting text in iOS browsers;
    9. Compatibility of getClientRects in overlays considering zoom;
    10. Split range by paragraphs to avoid over-highlighting on some blank space;
    11. Fix compatibility for unusual OEBPS item names and background style;
    12. Fix toc item without dest for some PDFs;
    13. Support footnotes with links inside the lists;
    14. Export container node so that it can be styled from the global CSS;
    15. Handle epub files without dc metadata;
    16. Follow ordinary link in popup footnotes;
    17. Always use gap for horizontal padding and margin for vertical padding;
    18. Parse cbz metadata from zip comment;
    19. Fix scroll prev at start and scroll next at end;
    20. Handle malformed href gracefully for pdf;
    21. Avoid segmentation after abbreviations in TTS;
    22. Add padding for overlayer underline and squiggly decoration;
    23. More accessible iframes to improve compatibility with browser extensions;
    24. Prevent scrollToAnchor on focus outside content container;
    25. Bump pdf.js to latest version 4;
    26. Last resort to get the first image in manifest as book cover;
    27. Add top, bottom, left, and right margins for content container;
    28. Added node filter for TTS;
    29. Lookup images in zip entries if not found in manifest;
---
 comic-book.js     |  23 +++++-
 epub.js           |  68 ++++++++++++++--
 fixed-layout.js   |   2 +
 footnotes.js      |  25 ++++--
 overlayer.js      |  92 ++++++++++++++++-----
 package-lock.json |   9 +++
 package.json      |   7 +-
 paginator.js      | 233 ++++++++++++++++++++++++++++++++++++------------------
 pdf.js            |  33 +++++---
 text-walker.js    |   2 +-
 tts.js            |  54 +++++++++----
 view.js           |  26 ++++--
 12 files changed, 425 insertions(+), 149 deletions(-)

diff --git a/comic-book.js b/comic-book.js
index 88c7a35..f4ec7ce 100644
--- a/comic-book.js
+++ b/comic-book.js
@@ -1,4 +1,4 @@
-export const makeComicBook = ({ entries, loadBlob, getSize }, file) => {
+export const makeComicBook = async ({ entries, loadBlob, getSize, getComment }, file) => {
     const cache = new Map()
     const urls = new Map()
     const load = async name => {
@@ -24,8 +24,27 @@ export const makeComicBook = ({ entries, loadBlob, getSize }, file) => {
     if (!files.length) throw new Error('No supported image files in archive')
 
     const book = {}
+    try {
+        const jsonComment = JSON.parse(await getComment() || '')
+        const info = jsonComment['ComicBookInfo/1.0']
+        if (info) {
+            const year = info.publicationYear
+            const month = info.publicationMonth
+            const mm = month && month >= 1 && month <= 12 ? String(month).padStart(2, '0') : null
+            book.metadata = {
+                title: info.title || file.name,
+                publisher: info.publisher,
+                language: info.language || info.lang,
+                author: info.credits ? info.credits.map(c => `${c.person} (${c.role})`).join(', ') : '',
+                published: year && month ? `${year}-${mm}` : undefined,
+            }
+        } else {
+            book.metadata = { title: file.name }
+        }
+    } catch {
+        book.metadata = { title: file.name }
+    }
     book.getCover = () => loadBlob(files[0])
-    book.metadata = { title: file.name }
     book.sections = files.map(name => ({
         id: name,
         load: () => load(name),
diff --git a/epub.js b/epub.js
index 0417d0d..40c07d1 100644
--- a/epub.js
+++ b/epub.js
@@ -94,7 +94,9 @@ const childGetter = (doc, ns) => {
 
 const resolveURL = (url, relativeTo) => {
     try {
-        if (relativeTo.includes(':')) return new URL(url, relativeTo)
+        // replace %2c in the url with a comma, this might be introduced by calibre
+        url = url.replace(/%2c/gi, ',').replace(/%3a/gi, ':')
+        if (relativeTo.includes(':') && !relativeTo.startsWith('OEBPS')) return new URL(url, relativeTo)
         // the base needs to be a valid URL, so set a base URL and then remove it
         const root = 'https://invalid.invalid/'
         const obj = new URL(url, root + relativeTo)
@@ -203,7 +205,7 @@ const getMetadata = opf => {
         if (!els) return null
         return Object.groupBy(els.map(parse), x => x.property)
     }
-    const dc = Object.fromEntries(Object.entries(Object.groupBy(els.dc, el => el.localName))
+    const dc = Object.fromEntries(Object.entries(Object.groupBy(els.dc || [], el => el.localName))
         .map(([name, els]) => [name, els.map(parse)]))
     const properties = getProperties() ?? {}
     const legacyMeta = Object.fromEntries(els.legacyMeta?.map(el =>
@@ -391,6 +393,20 @@ const parseClock = str => {
     return n * f
 }
 
+const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp']
+
+const getImageMediaType = (path) => {
+    const extension = path.toLowerCase().split('.').pop()
+    const mediaTypeMap = {
+        'jpg': 'image/jpeg',
+        'jpeg': 'image/jpeg',
+        'png': 'image/png',
+        'gif': 'image/gif',
+        'webp': 'image/webp',
+    }
+    return mediaTypeMap[extension] || 'image/jpeg'
+}
+
 class MediaOverlay extends EventTarget {
     #entries
     #lastMediaOverlayItem
@@ -670,8 +686,12 @@ class Resources {
             ?? this.getItemByID($$$(opf, 'meta')
                 .find(filterAttribute('name', 'cover'))
                 ?.getAttribute('content'))
+            ?? this.manifest.find(item => item.href.includes('cover')
+                && item.mediaType.startsWith('image'))
             ?? this.getItemByHref(this.guide
                 ?.find(ref => ref.type.includes('cover'))?.href)
+            // last resort: first image in manifest
+            ?? this.manifest.find(item => item.mediaType.startsWith('image'))
 
         this.cfis = CFI.fromElements($$itemref)
     }
@@ -704,14 +724,16 @@ class Resources {
 
 class Loader {
     #cache = new Map()
+    #cacheXHTMLContent = new Map()
     #children = new Map()
     #refCount = new Map()
     eventTarget = new EventTarget()
-    constructor({ loadText, loadBlob, resources }) {
+    constructor({ loadText, loadBlob, resources, entries }) {
         this.loadText = loadText
         this.loadBlob = loadBlob
         this.manifest = resources.manifest
         this.assets = resources.manifest
+        this.entries = entries
         // needed only when replacing in (X)HTML w/o parsing (see below)
         //.filter(({ mediaType }) => ![MIME.XHTML, MIME.HTML].includes(mediaType))
     }
@@ -726,6 +748,9 @@ class Loader {
         const url = URL.createObjectURL(new Blob([newData], { type: newType }))
         this.#cache.set(href, url)
         this.#refCount.set(href, 1)
+        if (newType === MIME.XHTML) {
+            this.#cacheXHTMLContent.set(url, {href, type: newType, data: newData})
+        }
         if (parent) {
             const childList = this.#children.get(parent)
             if (childList) childList.push(href)
@@ -749,8 +774,10 @@ class Loader {
         //console.log(`unreferencing ${href}, now ${count}`)
         if (count < 1) {
             //console.log(`unloading ${href}`)
-            URL.revokeObjectURL(this.#cache.get(href))
+            const url = this.#cache.get(href)
+            URL.revokeObjectURL(url)
             this.#cache.delete(href)
+            this.#cacheXHTMLContent.delete(url)
             this.#refCount.delete(href)
             // unref children
             const childList = this.#children.get(href)
@@ -782,11 +809,32 @@ class Loader {
         const tryLoadBlob = Promise.resolve().then(() => this.loadBlob(href))
         return this.createURL(href, tryLoadBlob, mediaType, parent)
     }
+    async loadItemXHTMLContent(item, parents = []) {
+        const url = await this.loadItem(item, parents)
+        if (url) return this.#cacheXHTMLContent.get(url)?.data
+    }
+    tryImageEntryItem(path) {
+        if (!IMAGE_EXTENSIONS.some(ext => path.toLowerCase().endsWith(`.${ext}`))) {
+            return null
+        }
+        if (!this.entries.get(path)) {
+            return null
+        }
+        return {
+            href: path,
+            mediaType: getImageMediaType(path),
+        }
+    }
     async loadHref(href, base, parents = []) {
         if (isExternal(href)) return href
         const path = resolveURL(href, base)
-        const item = this.manifest.find(item => item.href === path)
-        if (!item) return href
+        let item = this.manifest.find(item => item.href === path)
+        if (!item) {
+            item = this.tryImageEntryItem(path)
+            if (!item) {
+                return href
+            }
+        }
         return this.loadItem(item, parents.concat(base))
     }
     async loadReplaced(item, parents = []) {
@@ -932,7 +980,11 @@ export class EPUB {
     parser = new DOMParser()
     #loader
     #encryption
-    constructor({ loadText, loadBlob, getSize, sha1 }) {
+    constructor({ entries, loadText, loadBlob, getSize, sha1 }) {
+        this.entries = entries.reduce((map, entry) => {
+            map.set(entry.filename, entry)
+            return map
+        }, new Map())
         this.loadText = loadText
         this.loadBlob = loadBlob
         this.getSize = getSize
@@ -973,6 +1025,7 @@ ${doc.querySelector('parsererror').innerText}`)
             loadBlob: uri => Promise.resolve(this.loadBlob(uri))
                 .then(this.#encryption.getDecoder(uri)),
             resources: this.resources,
+            entries: this.entries,
         })
         this.transformTarget = this.#loader.eventTarget
         this.sections = this.resources.spine.map((spineItem, index) => {
@@ -986,6 +1039,7 @@ ${doc.querySelector('parsererror').innerText}`)
                 id: item.href,
                 load: () => this.#loader.loadItem(item),
                 unload: () => this.#loader.unloadItem(item),
+                loadContent: () => this.#loader.loadItemXHTMLContent(item),
                 createDocument: () => this.loadDocument(item),
                 size: this.getSize(item.href),
                 cfi: this.resources.cfis[index],
diff --git a/fixed-layout.js b/fixed-layout.js
index c582aba..195004b 100644
--- a/fixed-layout.js
+++ b/fixed-layout.js
@@ -1,3 +1,5 @@
+import 'construct-style-sheets-polyfill'
+
 const parseViewport = str => str
     ?.split(/[,;\s]/) // NOTE: technically, only the comma is valid
     ?.filter(x => x)
diff --git a/footnotes.js b/footnotes.js
index a1058cc..ca424d0 100644
--- a/footnotes.js
+++ b/footnotes.js
@@ -1,4 +1,7 @@
-const getTypes = el => new Set(el?.getAttributeNS?.('http://www.idpf.org/2007/ops', 'type')?.split(' '))
+const getTypes = el => new Set([
+    ...(el?.getAttributeNS?.('http://www.idpf.org/2007/ops', 'type')?.split(' ') ?? []),
+    ...(el?.attributes?.getNamedItem?.('epub:type')?.value?.split(' ') ?? []),
+])
 const getRoles = el => new Set(el?.getAttribute?.('role')?.split(' '))
 
 const isSuper = el => {
@@ -62,10 +65,18 @@ export class FootnoteHandler extends EventTarget {
                     const type = getReferencedType(el)
                     const hidden = el?.matches?.('aside') && type === 'footnote'
                     if (el) {
-                        const range = el.startContainer ? el : doc.createRange()
-                        if (!el.startContainer) {
-                            if (el.matches('li, aside')) range.selectNodeContents(el)
-                            else range.selectNode(el)
+                        let range
+                        if (el.startContainer) {
+                            range = el
+                        } else if (el.matches('li, aside')) {
+                            range = doc.createRange()
+                            range.selectNodeContents(el)
+                        } else if (el.closest('li')) {
+                            range = doc.createRange()
+                            range.selectNodeContents(el.closest('li'))
+                        } else {
+                            range = doc.createRange()
+                            range.selectNode(el)
                         }
                         const frag = range.extractContents()
                         doc.body.replaceChildren()
@@ -85,9 +96,9 @@ export class FootnoteHandler extends EventTarget {
         })
     }
     handle(book, e) {
-        const { a, href } = e.detail
+        const { a, href, follow } = e.detail
         const { yes, maybe } = isFootnoteReference(a)
-        if (yes) {
+        if (yes || follow) {
             e.preventDefault()
             return Promise.resolve(book.resolveHref(href)).then(target =>
                 this.#showFragment(book, target, href))
diff --git a/overlayer.js b/overlayer.js
index 6fd03ab..86be1a6 100644
--- a/overlayer.js
+++ b/overlayer.js
@@ -4,7 +4,9 @@ const createSVGElement = tag =>
 export class Overlayer {
     #svg = createSVGElement('svg')
     #map = new Map()
-    constructor() {
+    #doc = null
+    constructor(doc) {
+        this.#doc = doc
         Object.assign(this.#svg.style, {
             position: 'absolute', top: '0', left: '0',
             width: '100%', height: '100%',
@@ -14,10 +16,50 @@ export class Overlayer {
     get element() {
         return this.#svg
     }
+    get #zoom() {
+        // Safari does not zoom the client rects, while Chrome, Edge and Firefox does
+        if (/^((?!chrome|android).)*AppleWebKit/i.test(navigator.userAgent) && !window.chrome) {
+            return window.getComputedStyle(this.#doc.body).zoom || 1.0
+        }
+        return 1.0
+    }
+    #splitRangeByParagraph(range) {
+        const ancestor = range.commonAncestorContainer
+        const paragraphs = Array.from(ancestor.querySelectorAll?.('p') || [])
+        if (paragraphs.length === 0) return [range]
+
+        const splitRanges = []
+        paragraphs.forEach((p) => {
+            const pRange = document.createRange()
+            if (range.intersectsNode(p)) {
+                pRange.selectNodeContents(p)
+                if (pRange.compareBoundaryPoints(Range.START_TO_START, range) < 0) {
+                    pRange.setStart(range.startContainer, range.startOffset)
+                }
+                if (pRange.compareBoundaryPoints(Range.END_TO_END, range) > 0) {
+                    pRange.setEnd(range.endContainer, range.endOffset)
+                }
+                splitRanges.push(pRange)
+            }
+        })
+        return splitRanges
+    }
     add(key, range, draw, options) {
         if (this.#map.has(key)) this.remove(key)
         if (typeof range === 'function') range = range(this.#svg.getRootNode())
-        const rects = range.getClientRects()
+        const zoom = this.#zoom
+        let rects = []
+        this.#splitRangeByParagraph(range).forEach((pRange) => {
+            const pRects = Array.from(pRange.getClientRects()).map(rect => ({
+                left: rect.left * zoom,
+                top: rect.top * zoom,
+                right: rect.right * zoom,
+                bottom: rect.bottom * zoom,
+                width: rect.width * zoom,
+                height: rect.height * zoom,
+            }))
+            rects = rects.concat(pRects)
+        })
         const element = draw(rects, options)
         this.#svg.append(element)
         this.#map.set(key, { range, draw, options, element, rects })
@@ -31,7 +73,19 @@ export class Overlayer {
         for (const obj of this.#map.values()) {
             const { range, draw, options, element } = obj
             this.#svg.removeChild(element)
-            const rects = range.getClientRects()
+            const zoom = this.#zoom
+            let rects = []
+            this.#splitRangeByParagraph(range).forEach((pRange) => {
+                const pRects = Array.from(pRange.getClientRects()).map(rect => ({
+                    left: rect.left * zoom,
+                    top: rect.top * zoom,
+                    right: rect.right * zoom,
+                    bottom: rect.bottom * zoom,
+                    width: rect.width * zoom,
+                    height: rect.height * zoom,
+                }))
+                rects = rects.concat(pRects)
+            })
             const el = draw(rects, options)
             this.#svg.append(el)
             obj.element = el
@@ -50,13 +104,13 @@ export class Overlayer {
         return []
     }
     static underline(rects, options = {}) {
-        const { color = 'red', width: strokeWidth = 2, writingMode } = options
+        const { color = 'red', width: strokeWidth = 2, padding = 0, writingMode } = options
         const g = createSVGElement('g')
         g.setAttribute('fill', color)
         if (writingMode === 'vertical-rl' || writingMode === 'vertical-lr')
             for (const { right, top, height } of rects) {
                 const el = createSVGElement('rect')
-                el.setAttribute('x', right - strokeWidth)
+                el.setAttribute('x', right - strokeWidth / 2 + padding)
                 el.setAttribute('y', top)
                 el.setAttribute('height', height)
                 el.setAttribute('width', strokeWidth)
@@ -65,7 +119,7 @@ export class Overlayer {
         else for (const { left, bottom, width } of rects) {
             const el = createSVGElement('rect')
             el.setAttribute('x', left)
-            el.setAttribute('y', bottom - strokeWidth)
+            el.setAttribute('y', bottom - strokeWidth / 2 + padding)
             el.setAttribute('height', strokeWidth)
             el.setAttribute('width', width)
             g.append(el)
@@ -96,7 +150,7 @@ export class Overlayer {
         return g
     }
     static squiggly(rects, options = {}) {
-        const { color = 'red', width: strokeWidth = 2, writingMode } = options
+        const { color = 'red', width: strokeWidth = 2, padding = 0, writingMode } = options
         const g = createSVGElement('g')
         g.setAttribute('fill', 'none')
         g.setAttribute('stroke', color)
@@ -109,7 +163,7 @@ export class Overlayer {
                 const inline = height / n
                 const ls = Array.from({ length: n },
                     (_, i) => `l${i % 2 ? -block : block} ${inline}`).join('')
-                el.setAttribute('d', `M${right} ${top}${ls}`)
+                el.setAttribute('d', `M${right - strokeWidth / 2 + padding} ${top}${ls}`)
                 g.append(el)
             }
         else for (const { left, bottom, width } of rects) {
@@ -118,39 +172,39 @@ export class Overlayer {
             const inline = width / n
             const ls = Array.from({ length: n },
                 (_, i) => `l${inline} ${i % 2 ? block : -block}`).join('')
-            el.setAttribute('d', `M${left} ${bottom}${ls}`)
+            el.setAttribute('d', `M${left} ${bottom + strokeWidth / 2 + padding}${ls}`)
             g.append(el)
         }
         return g
     }
     static highlight(rects, options = {}) {
-        const { color = 'red' } = options
+        const { color = 'red', padding = 0 } = options
         const g = createSVGElement('g')
         g.setAttribute('fill', color)
         g.style.opacity = 'var(--overlayer-highlight-opacity, .3)'
         g.style.mixBlendMode = 'var(--overlayer-highlight-blend-mode, normal)'
         for (const { left, top, height, width } of rects) {
             const el = createSVGElement('rect')
-            el.setAttribute('x', left)
-            el.setAttribute('y', top)
-            el.setAttribute('height', height)
-            el.setAttribute('width', width)
+            el.setAttribute('x', left - padding)
+            el.setAttribute('y', top - padding)
+            el.setAttribute('height', height + padding * 2)
+            el.setAttribute('width', width + padding * 2)
             g.append(el)
         }
         return g
     }
     static outline(rects, options = {}) {
-        const { color = 'red', width: strokeWidth = 3, radius = 3 } = options
+        const { color = 'red', width: strokeWidth = 3, padding = 0, radius = 3 } = options
         const g = createSVGElement('g')
         g.setAttribute('fill', 'none')
         g.setAttribute('stroke', color)
         g.setAttribute('stroke-width', strokeWidth)
         for (const { left, top, height, width } of rects) {
             const el = createSVGElement('rect')
-            el.setAttribute('x', left)
-            el.setAttribute('y', top)
-            el.setAttribute('height', height)
-            el.setAttribute('width', width)
+            el.setAttribute('x', left - padding)
+            el.setAttribute('y', top - padding)
+            el.setAttribute('height', height + padding * 2)
+            el.setAttribute('width', width + padding * 2)
             el.setAttribute('rx', radius)
             g.append(el)
         }
diff --git a/package-lock.json b/package-lock.json
index 2341a20..a4fc3c7 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -8,6 +8,9 @@
       "name": "foliate-js",
       "version": "0.0.0",
       "license": "MIT",
+      "dependencies": {
+        "construct-style-sheets-polyfill": "^3.1.0"
+      },
       "devDependencies": {
         "@eslint/js": "^9.9.1",
         "@rollup/plugin-node-resolve": "^15.2.3",
@@ -596,6 +599,12 @@
       "license": "ISC",
       "optional": true
     },
+    "node_modules/construct-style-sheets-polyfill": {
+      "version": "3.1.0",
+      "resolved": "https://registry.npmmirror.com/construct-style-sheets-polyfill/-/construct-style-sheets-polyfill-3.1.0.tgz",
+      "integrity": "sha512-HBLKP0chz8BAY6rBdzda11c3wAZeCZ+kIG4weVC2NM3AXzxx09nhe8t0SQNdloAvg5GLuHwq/0SPOOSPvtCcKw==",
+      "license": "MIT"
+    },
     "node_modules/debug": {
       "version": "4.3.7",
       "resolved": "https://registry.npmjs.org/debug/-/debug-4.3.7.tgz",
diff --git a/package.json b/package.json
index e457e98..9dd931e 100644
--- a/package.json
+++ b/package.json
@@ -24,7 +24,7 @@
     "fflate": "^0.8.2",
     "fs-extra": "^11.2.0",
     "globals": "^15.9.0",
-    "pdfjs-dist": "^4.7.76",
+    "pdfjs-dist": "^4.10.38",
     "rollup": "^4.22.4"
   },
   "scripts": {
@@ -43,5 +43,8 @@
     "dictd",
     "stardict",
     "opds"
-  ]
+  ],
+  "dependencies": {
+    "construct-style-sheets-polyfill": "^3.1.0"
+  }
 }
diff --git a/paginator.js b/paginator.js
index 7980c20..ae9d39f 100644
--- a/paginator.js
+++ b/paginator.js
@@ -250,7 +250,7 @@ class View {
     get document() {
         return this.#iframe.contentDocument
     }
-    async load(src, afterLoad, beforeRender) {
+    async load(src, data, afterLoad, beforeRender) {
         if (typeof src !== 'string') throw new Error(`${src} is not string`)
         return new Promise(resolve => {
             this.#iframe.addEventListener('load', () => {
@@ -260,7 +260,9 @@ class View {
                 // it needs to be visible for Firefox to get computed style
                 this.#iframe.style.display = 'block'
                 const { vertical, rtl } = getDirection(doc)
-                const background = getBackground(doc)
+                this.docBackground = getBackground(doc)
+                doc.body.style.background = 'none'
+                const background = this.docBackground
                 this.#iframe.style.display = 'none'
 
                 this.#vertical = vertical
@@ -279,22 +281,28 @@ class View {
 
                 resolve()
             }, { once: true })
-            this.#iframe.src = src
+            if (data) {
+                this.#iframe.srcdoc = data
+            } else {
+                this.#iframe.src = src
+            }
         })
     }
     render(layout) {
-        if (!layout) return
+        if (!layout || !this.document) return
         this.#column = layout.flow !== 'scrolled'
         this.#layout = layout
         if (this.#column) this.columnize(layout)
         else this.scrolled(layout)
     }
-    scrolled({ gap, columnWidth }) {
+    scrolled({ marginTop, marginRight, marginBottom, marginLeft, gap, columnWidth }) {
         const vertical = this.#vertical
         const doc = this.document
         setStylesImportant(doc.documentElement, {
             'box-sizing': 'border-box',
-            'padding': vertical ? `${gap}px 0` : `0 ${gap}px`,
+            'padding': vertical
+                ? `${marginTop}px ${gap}px ${marginBottom}px ${gap}px`
+                : `0px ${gap / 2 + marginRight}px 0px ${gap / 2 + marginLeft}px`,
             'column-width': 'auto',
             'height': 'auto',
             'width': 'auto',
@@ -306,7 +314,7 @@ class View {
         this.setImageSize()
         this.expand()
     }
-    columnize({ width, height, gap, columnWidth }) {
+    columnize({ width, height, marginTop, marginRight, marginBottom, marginLeft, gap, columnWidth }) {
         const vertical = this.#vertical
         this.#size = vertical ? height : width
 
@@ -314,12 +322,14 @@ class View {
         setStylesImportant(doc.documentElement, {
             'box-sizing': 'border-box',
             'column-width': `${Math.trunc(columnWidth)}px`,
-            'column-gap': `${gap}px`,
+            'column-gap': vertical ? `${(marginTop + marginBottom) / 2}px` : `${gap + marginRight / 2 + marginLeft / 2}px`,
             'column-fill': 'auto',
             ...(vertical
                 ? { 'width': `${width}px` }
                 : { 'height': `${height}px` }),
-            'padding': vertical ? `${gap / 2}px 0` : `0 ${gap / 2}px`,
+            'padding': vertical
+                ? `${marginTop / 2}px ${marginRight}px ${marginBottom / 2}px ${marginLeft}px`
+                : `0px ${gap / 2 + marginRight / 2}px 0px ${gap / 2 + marginLeft / 2}px`,
             'overflow': 'hidden',
             // force wrap long words
             'overflow-wrap': 'break-word',
@@ -339,7 +349,7 @@ class View {
         this.expand()
     }
     setImageSize() {
-        const { width, height, margin } = this.#layout
+        const { width, height, marginTop, marginRight, marginBottom, marginLeft } = this.#layout
         const vertical = this.#vertical
         const doc = this.document
         for (const el of doc.body.querySelectorAll('img, svg, video')) {
@@ -348,9 +358,9 @@ class View {
             setStylesImportant(el, {
                 'max-height': vertical
                     ? (maxHeight !== 'none' && maxHeight !== '0px' ? maxHeight : '100%')
-                    : `${height - margin * 2}px`,
+                    : `${height - marginTop - marginBottom }px`,
                 'max-width': vertical
-                    ? `${width - margin * 2}px`
+                    ? `${width - marginLeft - marginRight }px`
                     : (maxWidth !== 'none' && maxWidth !== '0px' ? maxWidth : '100%'),
                 'object-fit': 'contain',
                 'page-break-inside': 'avoid',
@@ -391,8 +401,8 @@ class View {
             const otherSide = this.#vertical ? 'height' : 'width'
             const contentSize = documentElement.getBoundingClientRect()[side]
             const expandedSize = contentSize
-            const { margin } = this.#layout
-            const padding = this.#vertical ? `0 ${margin}px` : `${margin}px 0`
+            const { marginTop, marginRight, marginBottom, marginLeft } = this.#layout
+            const padding = this.#vertical ? `0 ${marginRight}px 0 ${marginLeft}px` : `${marginTop}px 0 ${marginBottom}px 0`
             this.#element.style.padding = padding
             this.#iframe.style[side] = `${expandedSize}px`
             this.#element.style[side] = `${expandedSize}px`
@@ -423,10 +433,10 @@ class View {
 // NOTE: everything here assumes the so-called "negative scroll type" for RTL
 export class Paginator extends HTMLElement {
     static observedAttributes = [
-        'flow', 'gap', 'margin',
+        'flow', 'gap', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
         'max-inline-size', 'max-block-size', 'max-column-count',
     ]
-    #root = this.attachShadow({ mode: 'closed' })
+    #root = this.attachShadow({ mode: 'open' })
     #observer = new ResizeObserver(() => this.render())
     #top
     #background
@@ -436,7 +446,8 @@ export class Paginator extends HTMLElement {
     #view
     #vertical = false
     #rtl = false
-    #margin = 0
+    #marginTop = 0
+    #marginBottom = 0
     #index = -1
     #anchor = 0 // anchor view to a fraction (0-1), Range, or Element
     #justAnchored = false
@@ -465,26 +476,31 @@ export class Paginator extends HTMLElement {
         }
         #top {
             --_gap: 7%;
-            --_margin: 48px;
+            --_margin-top: 48px;
+            --_margin-right: 48px;
+            --_margin-bottom: 48px;
+            --_margin-left: 48px;
             --_max-inline-size: 720px;
             --_max-block-size: 1440px;
             --_max-column-count: 2;
-            --_max-column-count-portrait: 1;
+            --_max-column-count-portrait: var(--_max-column-count);
             --_max-column-count-spread: var(--_max-column-count);
             --_half-gap: calc(var(--_gap) / 2);
+            --_half-margin-left: calc(var(--_margin-left) / 2);
+            --_half-margin-right: calc(var(--_margin-right) / 2);
             --_max-width: calc(var(--_max-inline-size) * var(--_max-column-count-spread));
             --_max-height: var(--_max-block-size);
             display: grid;
             grid-template-columns:
-                minmax(var(--_half-gap), 1fr)
-                var(--_half-gap)
+                minmax(var(--_half-margin-left), 1fr)
+                var(--_half-margin-left)
                 minmax(0, calc(var(--_max-width) - var(--_gap)))
-                var(--_half-gap)
-                minmax(var(--_half-gap), 1fr);
+                var(--_half-margin-right)
+                minmax(var(--_half-margin-right), 1fr);
             grid-template-rows:
-                minmax(var(--_margin), 1fr)
+                minmax(var(--_margin-top), 1fr)
                 minmax(0, var(--_max-height))
-                minmax(var(--_margin), 1fr);
+                minmax(var(--_margin-bottom), 1fr);
             &.vertical {
                 --_max-column-count-spread: var(--_max-column-count-portrait);
                 --_max-width: var(--_max-block-size);
@@ -522,9 +538,13 @@ export class Paginator extends HTMLElement {
             grid-row: 3;
             align-self: end;
         }
-        #header, #footer {
+        #header {
             display: grid;
-            height: var(--_margin);
+            height: var(--_margin-top);
+        }
+        #footer {
+            display: grid;
+            height: var(--_margin-bottom);
         }
         :is(#header, #footer) > * {
             display: flex;
@@ -544,7 +564,7 @@ export class Paginator extends HTMLElement {
         <div id="top">
             <div id="background" part="filter"></div>
             <div id="header"></div>
-            <div id="container"></div>
+            <div id="container" part="container"></div>
             <div id="footer"></div>
         </div>
         `
@@ -605,7 +625,8 @@ export class Paginator extends HTMLElement {
                 if (!range) return
                 const sel = doc.getSelection()
                 if (!sel.rangeCount) return
-                if (isPointerSelecting && sel.type === 'Range')
+                // FIXME: this won't work on Android WebView, disable for now
+                if (!isPointerSelecting && isPointerSelecting && sel.type === 'Range')
                     checkPointerSelection(range, sel)
                 else if (isKeyboardSelecting) {
                     const selRange = sel.getRangeAt(0).cloneRange()
@@ -614,14 +635,18 @@ export class Paginator extends HTMLElement {
                     this.#scrollToAnchor(selRange)
                 }
             })
-            doc.addEventListener('focusin', e => this.scrolled ? null :
-                // NOTE: `requestAnimationFrame` is needed in WebKit
-                requestAnimationFrame(() => this.#scrollToAnchor(e.target)))
+            doc.addEventListener('focusin', e => {
+                if (this.scrolled) return null
+                if (this.#container && this.#container.contains(e.target)) {
+                    // NOTE: `requestAnimationFrame` is needed in WebKit
+                    requestAnimationFrame(() => this.#scrollToAnchor(e.target))
+                }
+            })
         })
 
         this.#mediaQueryListener = () => {
             if (!this.#view) return
-            this.#background.style.background = getBackground(this.#view.document)
+            this.#replaceBackground(this.#view.docBackground, this.columnCount)
         }
         this.#mediaQuery.addEventListener('change', this.#mediaQueryListener)
     }
@@ -631,10 +656,14 @@ export class Paginator extends HTMLElement {
                 this.render()
                 break
             case 'gap':
-            case 'margin':
+            case 'margin-top':
+            case 'margin-bottom':
+            case 'margin-left':
+            case 'margin-right':
             case 'max-block-size':
             case 'max-column-count':
                 this.#top.style.setProperty('--_' + name, value)
+                this.render()
                 break
             case 'max-inline-size':
                 // needs explicit `render()` as it doesn't necessarily resize
@@ -648,14 +677,9 @@ export class Paginator extends HTMLElement {
         this.sections = book.sections
         book.transformTarget?.addEventListener('data', ({ detail }) => {
             if (detail.type !== 'text/css') return
-            const w = innerWidth
-            const h = innerHeight
             detail.data = Promise.resolve(detail.data).then(data => data
                 // unprefix as most of the props are (only) supported unprefixed
                 .replace(/(?<=[{\s;])-epub-/gi, '')
-                // replace vw and vh as they cause problems with layout
-                .replace(/(\d*\.?\d+)vw/gi, (_, d) => parseFloat(d) * w / 100 + 'px')
-                .replace(/(\d*\.?\d+)vh/gi, (_, d) => parseFloat(d) * h / 100 + 'px')
                 // `page-break-*` unsupported in columns; replace with `column-break-*`
                 .replace(/page-break-(after|before|inside)\s*:/gi, (_, x) =>
                     `-webkit-column-break-${x}:`)
@@ -675,23 +699,50 @@ export class Paginator extends HTMLElement {
         this.#container.append(this.#view.element)
         return this.#view
     }
+    #replaceBackground(background, columnCount) {
+        const doc = this.#view?.document
+        if (!doc) return
+        const htmlStyle = doc.defaultView.getComputedStyle(doc.documentElement)
+        const themeBgColor = htmlStyle.getPropertyValue('--theme-bg-color')
+        const isDarkMode = htmlStyle.getPropertyValue('color-scheme') === 'dark'
+        if (background && themeBgColor) {
+            const parsedBackground = background.split(/\s(?=(?:url|rgb|hsl|#[0-9a-fA-F]{3,6}))/)
+            if (isDarkMode) {
+                parsedBackground[0] = themeBgColor
+            }
+            background = parsedBackground.join(' ')
+        }
+        if (/cover.*fixed|fixed.*cover/.test(background)) {
+            background = background.replace('cover', 'auto 100%').replace('fixed', '')
+        }
+        this.#background.innerHTML = ''
+        this.#background.style.display = 'grid'
+        this.#background.style.gridTemplateColumns = `repeat(${columnCount}, 1fr)`
+        for (let i = 0; i < columnCount; i++) {
+            const column = document.createElement('div')
+            column.style.background = background
+            column.style.width = '100%'
+            column.style.height = '100%'
+            this.#background.appendChild(column)
+        }
+    }
     #beforeRender({ vertical, rtl, background }) {
         this.#vertical = vertical
         this.#rtl = rtl
         this.#top.classList.toggle('vertical', vertical)
 
-        // set background to `doc` background
-        // this is needed because the iframe does not fill the whole element
-        this.#background.style.background = background
-
         const { width, height } = this.#container.getBoundingClientRect()
         const size = vertical ? height : width
 
         const style = getComputedStyle(this.#top)
         const maxInlineSize = parseFloat(style.getPropertyValue('--_max-inline-size'))
         const maxColumnCount = parseInt(style.getPropertyValue('--_max-column-count-spread'))
-        const margin = parseFloat(style.getPropertyValue('--_margin'))
-        this.#margin = margin
+        const marginTop = parseFloat(style.getPropertyValue('--_margin-top'))
+        const marginRight = parseFloat(style.getPropertyValue('--_margin-right'))
+        const marginBottom = parseFloat(style.getPropertyValue('--_margin-bottom'))
+        const marginLeft = parseFloat(style.getPropertyValue('--_margin-left'))
+        this.#marginTop = marginTop
+        this.#marginBottom = marginBottom
 
         const g = parseFloat(style.getPropertyValue('--_gap')) / 100
         // The gap will be a percentage of the #container, not the whole view.
@@ -725,13 +776,20 @@ export class Paginator extends HTMLElement {
             this.#header.replaceChildren()
             this.#footer.replaceChildren()
 
-            return { flow, margin, gap, columnWidth }
+            return { flow, marginTop, marginRight, marginBottom, marginLeft, gap: g * size, columnWidth }
         }
 
         const divisor = Math.min(maxColumnCount, Math.ceil(size / maxInlineSize))
-        const columnWidth = (size / divisor) - gap
+        const columnWidth = vertical
+            ? (size / divisor - (marginTop + marginBottom) / 2)
+            : (size / divisor - gap - marginRight / 2 - marginLeft / 2)
         this.setAttribute('dir', rtl ? 'rtl' : 'ltr')
 
+        // set background to `doc` background
+        // this is needed because the iframe does not fill the whole element
+        this.columnCount = divisor
+        this.#replaceBackground(background, this.columnCount)
+
         const marginalDivisor = vertical
             ? Math.min(2, Math.ceil(width / maxInlineSize))
             : divisor
@@ -749,13 +807,14 @@ export class Paginator extends HTMLElement {
         this.#header.replaceChildren(...heads)
         this.#footer.replaceChildren(...feet)
 
-        return { height, width, margin, gap, columnWidth }
+        return { height, width, marginTop, marginRight, marginBottom, marginLeft, gap, columnWidth }
     }
     render() {
         if (!this.#view) return
         this.#view.render(this.#beforeRender({
             vertical: this.#vertical,
             rtl: this.#rtl,
+            background: this.#view.docBackground,
         }))
         this.#scrollToAnchor(this.#anchor)
     }
@@ -776,6 +835,7 @@ export class Paginator extends HTMLElement {
         return this.#container.getBoundingClientRect()[this.sideProp]
     }
     get viewSize() {
+        if (!this.#view || !this.#view.element) return 0
         return this.#view.element.getBoundingClientRect()[this.sideProp]
     }
     get start() {
@@ -790,17 +850,23 @@ export class Paginator extends HTMLElement {
     get pages() {
         return Math.round(this.viewSize / this.size)
     }
+    get containerPosition() {
+        return this.#container[this.scrollProp]
+    }
+    set containerPosition(newVal) {
+        this.#container[this.scrollProp] = newVal
+    }
+
     scrollBy(dx, dy) {
         const delta = this.#vertical ? dy : dx
-        const element = this.#container
-        const { scrollProp } = this
         const [offset, a, b] = this.#scrollBounds
         const rtl = this.#rtl
         const min = rtl ? offset - b : offset - a
         const max = rtl ? offset + a : offset + b
-        element[scrollProp] = Math.max(min, Math.min(max,
-            element[scrollProp] + delta))
+        this.containerPosition = Math.max(min, Math.min(max,
+            this.containerPosition + delta))
     }
+
     snap(vx, vy) {
         const velocity = this.#vertical ? vy : vx
         const [offset, a, b] = this.#scrollBounds
@@ -837,6 +903,11 @@ export class Paginator extends HTMLElement {
             if (this.#touchScrolled) e.preventDefault()
             return
         }
+        const doc = this.#view?.document
+        const selection = doc?.getSelection()
+        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
+            return
+        }
         e.preventDefault()
         const touch = e.changedTouches[0]
         const x = touch.screenX, y = touch.screenY
@@ -848,9 +919,14 @@ export class Paginator extends HTMLElement {
         state.vx = dx / dt
         state.vy = dy / dt
         this.#touchScrolled = true
-        this.scrollBy(dx, dy)
+        if (Math.abs(dx) >= Math.abs(dy)) {
+            this.scrollBy(dx, 0)
+        } else if (Math.abs(dy) > Math.abs(dx)) {
+            this.scrollBy(0, dy)
+        }
     }
     #onTouchEnd() {
+        if (!this.#touchScrolled) return
         this.#touchScrolled = false
         if (this.scrolled) return
 
@@ -866,11 +942,12 @@ export class Paginator extends HTMLElement {
     #getRectMapper() {
         if (this.scrolled) {
             const size = this.viewSize
-            const margin = this.#margin
+            const marginTop = this.#marginTop
+            const marginBottom = this.#marginBottom
             return this.#vertical
                 ? ({ left, right }) =>
-                    ({ left: size - right - margin, right: size - left - margin })
-                : ({ top, bottom }) => ({ left: top + margin, right: bottom + margin })
+                    ({ left: size - right - marginTop, right: size - left - marginBottom })
+                : ({ top, bottom }) => ({ left: top + marginTop, right: bottom + marginBottom })
         }
         const pxSize = this.pages * this.size
         return this.#rtl
@@ -882,16 +959,15 @@ export class Paginator extends HTMLElement {
     }
     async #scrollToRect(rect, reason) {
         if (this.scrolled) {
-            const offset = this.#getRectMapper()(rect).left - this.#margin
+            const offset = this.#getRectMapper()(rect).left - this.#marginTop
             return this.#scrollTo(offset, reason)
         }
         const offset = this.#getRectMapper()(rect).left
         return this.#scrollToPage(Math.floor(offset / this.size) + (this.#rtl ? -1 : 1), reason)
     }
     async #scrollTo(offset, reason, smooth) {
-        const element = this.#container
-        const { scrollProp, size } = this
-        if (element[scrollProp] === offset) {
+        const { size } = this
+        if (this.containerPosition === offset) {
             this.#scrollBounds = [offset, this.atStart ? 0 : size, this.atEnd ? 0 : size]
             this.#afterScroll(reason)
             return
@@ -899,14 +975,14 @@ export class Paginator extends HTMLElement {
         // FIXME: vertical-rl only, not -lr
         if (this.scrolled && this.#vertical) offset = -offset
         if ((reason === 'snap' || smooth) && this.hasAttribute('animated')) return animate(
-            element[scrollProp], offset, 300, easeOutQuad,
-            x => element[scrollProp] = x,
+            this.containerPosition, offset, 300, easeOutQuad,
+            x => this.containerPosition = x,
         ).then(() => {
             this.#scrollBounds = [offset, this.atStart ? 0 : size, this.atEnd ? 0 : size]
             this.#afterScroll(reason)
         })
         else {
-            element[scrollProp] = offset
+            this.containerPosition = offset
             this.#scrollBounds = [offset, this.atStart ? 0 : size, this.atEnd ? 0 : size]
             this.#afterScroll(reason)
         }
@@ -944,7 +1020,7 @@ export class Paginator extends HTMLElement {
     }
     #getVisibleRange() {
         if (this.scrolled) return getVisibleRange(this.#view.document,
-            this.start + this.#margin, this.end - this.#margin, this.#getRectMapper())
+            this.start + this.#marginTop, this.end - this.#marginBottom, this.#getRectMapper())
         const size = this.#rtl ? -this.size : this.size
         return getVisibleRange(this.#view.document,
             this.start - size, this.end - size, this.#getRectMapper())
@@ -969,7 +1045,7 @@ export class Paginator extends HTMLElement {
         this.dispatchEvent(new CustomEvent('relocate', { detail }))
     }
     async #display(promise) {
-        const { index, src, anchor, onLoad, select } = await promise
+        const { index, src, data, anchor, onLoad, select } = await promise
         this.#index = index
         const hasFocus = this.#view?.document?.hasFocus()
         if (src) {
@@ -985,7 +1061,7 @@ export class Paginator extends HTMLElement {
                 onLoad?.({ doc, index })
             }
             const beforeRender = this.#beforeRender.bind(this)
-            await view.load(src, afterLoad, beforeRender)
+            await view.load(src, data, afterLoad, beforeRender)
             this.dispatchEvent(new CustomEvent('create-overlayer', {
                 detail: {
                     doc: view.document, index,
@@ -1001,7 +1077,7 @@ export class Paginator extends HTMLElement {
     #canGoToIndex(index) {
         return index >= 0 && index <= this.sections.length - 1
     }
-    async #goTo({ index, anchor, select}) {
+    async #goTo({ index, anchor, select }) {
         if (index === this.#index) await this.#display({ index, anchor, select })
         else {
             const oldIndex = this.#index
@@ -1011,8 +1087,10 @@ export class Paginator extends HTMLElement {
                 this.dispatchEvent(new CustomEvent('load', { detail }))
             }
             await this.#display(Promise.resolve(this.sections[index].load())
-                .then(src => ({ index, src, anchor, onLoad, select }))
-                .catch(e => {
+                .then(async src => {
+                    const data = await this.sections[index].loadContent?.()
+                    return { index, src, data, anchor, onLoad, select }
+                }).catch(e => {
                     console.warn(e)
                     console.warn(new Error(`Failed to load section ${index}`))
                     return {}
@@ -1029,7 +1107,7 @@ export class Paginator extends HTMLElement {
         if (this.scrolled) {
             if (this.start > 0) return this.#scrollTo(
                 Math.max(0, this.start - (distance ?? this.size)), null, true)
-            return true
+            return !this.atStart
         }
         if (this.atStart) return
         const page = this.page - 1
@@ -1040,7 +1118,7 @@ export class Paginator extends HTMLElement {
         if (this.scrolled) {
             if (this.viewSize - this.end > 2) return this.#scrollTo(
                 Math.min(this.viewSize, distance ? this.start + distance : this.end), null, true)
-            return true
+            return !this.atEnd
         }
         if (this.atEnd) return
         const page = this.page + 1
@@ -1069,11 +1147,11 @@ export class Paginator extends HTMLElement {
         if (shouldGo || !this.hasAttribute('animated')) await wait(100)
         this.#locked = false
     }
-    prev(distance) {
-        return this.#turnPage(-1, distance)
+    async prev(distance) {
+        return await this.#turnPage(-1, distance)
     }
-    next(distance) {
-        return this.#turnPage(1, distance)
+    async next(distance) {
+        return await this.#turnPage(1, distance)
     }
     prevSection() {
         return this.goTo({ index: this.#adjacentIndex(-1) })
@@ -1109,8 +1187,9 @@ export class Paginator extends HTMLElement {
         } else $style.textContent = styles
 
         // NOTE: needs `requestAnimationFrame` in Chromium
-        requestAnimationFrame(() =>
-            this.#background.style.background = getBackground(this.#view.document))
+        requestAnimationFrame(() => {
+            this.#replaceBackground(this.#view.docBackground, this.columnCount)
+        })
 
         // needed because the resize observer doesn't work in Firefox
         this.#view?.document?.fonts?.ready?.then(() => this.#view.expand())
diff --git a/pdf.js b/pdf.js
index 5abf583..2668991 100644
--- a/pdf.js
+++ b/pdf.js
@@ -1,16 +1,13 @@
-const pdfjsPath = path => new URL(`vendor/pdfjs/${path}`, import.meta.url).toString()
+const pdfjsPath = path => `/vendor/pdfjs/${path}`
 
-import './vendor/pdfjs/pdf.mjs'
+import '@pdfjs/pdf.mjs'
 const pdfjsLib = globalThis.pdfjsLib
-pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsPath('pdf.worker.mjs')
+pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsPath('pdf.worker.min.mjs')
 
 const fetchText = async url => await (await fetch(url)).text()
 
-// https://github.com/mozilla/pdf.js/blob/642b9a5ae67ef642b9a8808fd9efd447e8c350e2/web/text_layer_builder.css
-const textLayerBuilderCSS = await fetchText(pdfjsPath('text_layer_builder.css'))
-
-// https://github.com/mozilla/pdf.js/blob/642b9a5ae67ef642b9a8808fd9efd447e8c350e2/web/annotation_layer_builder.css
-const annotationLayerBuilderCSS = await fetchText(pdfjsPath('annotation_layer_builder.css'))
+let textLayerBuilderCSS = null
+let annotationLayerBuilderCSS = null
 
 const render = async (page, doc, zoom) => {
     const scale = zoom * devicePixelRatio
@@ -77,6 +74,14 @@ const renderPage = async (page, getImageBlob) => {
         await page.render({ canvasContext, viewport }).promise
         return new Promise(resolve => canvas.toBlob(resolve))
     }
+    // https://github.com/mozilla/pdf.js/blob/642b9a5ae67ef642b9a8808fd9efd447e8c350e2/web/text_layer_builder.css
+    if (textLayerBuilderCSS == null) {
+        textLayerBuilderCSS = await fetchText(pdfjsPath('text_layer_builder.css'))
+    }
+    // https://github.com/mozilla/pdf.js/blob/642b9a5ae67ef642b9a8808fd9efd447e8c350e2/web/annotation_layer_builder.css
+    if (annotationLayerBuilderCSS == null) {
+        annotationLayerBuilderCSS = await fetchText(pdfjsPath('annotation_layer_builder.css'))
+    }
     const src = URL.createObjectURL(new Blob([`
         <!DOCTYPE html>
         <html lang="en">
@@ -100,7 +105,7 @@ const renderPage = async (page, getImageBlob) => {
 
 const makeTOCItem = item => ({
     label: item.title,
-    href: JSON.stringify(item.dest),
+    href: item.dest ? JSON.stringify(item.dest) : '',
     subitems: item.items.length ? item.items.map(makeTOCItem) : null,
 })
 
@@ -159,11 +164,17 @@ export const makePDF = async file => {
         return { index }
     }
     book.splitTOCHref = async href => {
+        if (!href) return [null, null]
         const parsed = JSON.parse(href)
         const dest = typeof parsed === 'string'
             ? await pdf.getDestination(parsed) : parsed
-        const index = await pdf.getPageIndex(dest[0])
-        return [index, null]
+        try {
+            const index = await pdf.getPageIndex(dest[0])
+            return [index, null]
+        } catch (e) {
+            console.warn('Error getting page index for href', href)
+            return [null, null]
+        }
     }
     book.getTOCFragment = doc => doc.documentElement
     book.getCover = async () => renderPage(await pdf.getPage(1), true)
diff --git a/text-walker.js b/text-walker.js
index 4ff9dff..c1249b7 100644
--- a/text-walker.js
+++ b/text-walker.js
@@ -32,7 +32,7 @@ export const textWalker = function* (x, func, filterFunc) {
     const walker = document.createTreeWalker(root, filter, { acceptNode: filterFunc || acceptNode })
     const walk = x.commonAncestorContainer ? walkRange : walkDocument
     const nodes = walk(x, walker)
-    const strs = nodes.map(node => node.nodeValue)
+    const strs = nodes.map(node => node.nodeValue ?? '')
     const makeRange = (startIndex, startOffset, endIndex, endOffset) => {
         const range = document.createRange()
         range.setStart(nodes[startIndex], startOffset)
diff --git a/tts.js b/tts.js
index dee3c57..54df0ef 100644
--- a/tts.js
+++ b/tts.js
@@ -25,11 +25,32 @@ const getSegmenter = (lang = 'en', granularity = 'word') => {
     const segmenter = new Intl.Segmenter(lang, { granularity })
     const granularityIsWord = granularity === 'word'
     return function* (strs, makeRange) {
-        const str = strs.join('')
+        const str = strs.join('').replace(/\r\n/g, '  ').replace(/\r/g, ' ').replace(/\n/g, ' ')
         let name = 0
         let strIndex = -1
         let sum = 0
-        for (const { index, segment, isWordLike } of segmenter.segment(str)) {
+        const rawSegments = Array.from(segmenter.segment(str))
+        const mergedSegments = []
+        for (let i = 0; i < rawSegments.length; i++) {
+            const current = rawSegments[i]
+            const next = rawSegments[i + 1]
+            const segment = current.segment.trim()
+            const nextSegment = next?.segment?.trim()
+            const endsWithAbbr = /(?:^|\s)([A-Z][a-z]{1,5})\.$/.test(segment)
+            const nextStartsWithCapital = /^[A-Z]/.test(nextSegment || '')
+            if (endsWithAbbr && nextStartsWithCapital) {
+                const mergedSegment = {
+                    index: current.index,
+                    segment: current.segment + (next?.segment || ''),
+                    isWordLike: true,
+                }
+                mergedSegments.push(mergedSegment)
+                i++
+            } else {
+                mergedSegments.push(current)
+            }
+        }
+        for (const { index, segment, isWordLike } of mergedSegments) {
             if (granularityIsWord && !isWordLike) continue
             while (sum <= index) sum += strs[++strIndex].length
             const startIndex = strIndex
@@ -44,7 +65,7 @@ const getSegmenter = (lang = 'en', granularity = 'word') => {
     }
 }
 
-const fragmentToSSML = (fragment, inherited) => {
+const fragmentToSSML = (fragment, nodeFilter, inherited) => {
     const ssml = document.implementation.createDocument(NS.SSML, 'speak')
     const { lang } = inherited
     if (lang) ssml.documentElement.setAttributeNS(NS.XML, 'lang', lang)
@@ -53,7 +74,8 @@ const fragmentToSSML = (fragment, inherited) => {
         if (!node) return
         if (node.nodeType === 3) return ssml.createTextNode(node.textContent)
         if (node.nodeType === 4) return ssml.createCDATASection(node.textContent)
-        if (node.nodeType !== 1) return
+        if (node.nodeType !== 1 && node.nodeType !== 11) return
+        if (nodeFilter && nodeFilter(node) === NodeFilter.FILTER_REJECT) return
 
         let el
         const nodeName = node.nodeName.toLowerCase()
@@ -66,15 +88,15 @@ const fragmentToSSML = (fragment, inherited) => {
         else if (nodeName === 'em' || nodeName === 'strong')
             el = ssml.createElementNS(NS.SSML, 'emphasis')
 
-        const lang = node.lang || node.getAttributeNS(NS.XML, 'lang')
+        const lang = node.lang || node.getAttributeNS?.(NS.XML, 'lang')
         if (lang) {
             if (!el) el = ssml.createElementNS(NS.SSML, 'lang')
             el.setAttributeNS(NS.XML, 'lang', lang)
         }
 
-        const alphabet = node.getAttributeNS(NS.SSML, 'alphabet') || inheritedAlphabet
+        const alphabet = node.getAttributeNS?.(NS.SSML, 'alphabet') || inheritedAlphabet
         if (!el) {
-            const ph = node.getAttributeNS(NS.SSML, 'ph')
+            const ph = node.getAttributeNS?.(NS.SSML, 'ph')
             if (ph) {
                 el = ssml.createElementNS(NS.SSML, 'phoneme')
                 if (alphabet) el.setAttribute('alphabet', alphabet)
@@ -92,11 +114,11 @@ const fragmentToSSML = (fragment, inherited) => {
         }
         return el
     }
-    convert(fragment.firstChild, ssml.documentElement, inherited.alphabet)
+    convert(fragment, ssml.documentElement, inherited.alphabet)
     return ssml
 }
 
-const getFragmentWithMarks = (range, textWalker, granularity) => {
+const getFragmentWithMarks = (range, textWalker, nodeFilter, granularity) => {
     const lang = getLang(range.commonAncestorContainer)
     const alphabet = getAlphabet(range.commonAncestorContainer)
 
@@ -106,15 +128,15 @@ const getFragmentWithMarks = (range, textWalker, granularity) => {
     // we need ranges on both the original document (for highlighting)
     // and the document fragment (for inserting marks)
     // so unfortunately need to do it twice, as you can't copy the ranges
-    const entries = [...textWalker(range, segmenter)]
-    const fragmentEntries = [...textWalker(fragment, segmenter)]
+    const entries = [...textWalker(range, segmenter, nodeFilter)]
+    const fragmentEntries = [...textWalker(fragment, segmenter, nodeFilter)]
 
     for (const [name, range] of fragmentEntries) {
         const mark = document.createElement('foliate-mark')
         mark.dataset.name = name
         range.insertNode(mark)
     }
-    const ssml = fragmentToSSML(fragment, { lang, alphabet })
+    const ssml = fragmentToSSML(fragment, nodeFilter, { lang, alphabet })
     return { entries, ssml }
 }
 
@@ -207,11 +229,11 @@ export class TTS {
     #ranges
     #lastMark
     #serializer = new XMLSerializer()
-    constructor(doc, textWalker, highlight, granularity) {
+    constructor(doc, textWalker, nodeFilter, highlight, granularity) {
         this.doc = doc
         this.highlight = highlight
         this.#list = new ListIterator(getBlocks(doc), range => {
-            const { entries, ssml } = getFragmentWithMarks(range, textWalker, granularity)
+            const { entries, ssml } = getFragmentWithMarks(range, textWalker, nodeFilter, granularity)
             this.#ranges = new Map(entries)
             return [ssml, range]
         })
@@ -231,7 +253,8 @@ export class TTS {
             node.parentNode.removeChild(node)
             node = next
         }
-        return this.#serializer.serializeToString(ssml)
+        const ssmlStr = this.#serializer.serializeToString(ssml)
+        return ssmlStr
     }
     start() {
         this.#lastMark = null
@@ -273,6 +296,7 @@ export class TTS {
         if (range) {
             this.#lastMark = mark
             this.highlight(range.cloneRange())
+            return range
         }
     }
 }
diff --git a/view.js b/view.js
index 23d8357..a6d4b81 100644
--- a/view.js
+++ b/view.js
@@ -211,7 +211,7 @@ const languageInfo = lang => {
 }
 
 export class View extends HTMLElement {
-    #root = this.attachShadow({ mode: 'closed' })
+    #root = this.attachShadow({ mode: 'open' })
     #sectionProgress
     #tocProgress
     #pageProgress
@@ -256,7 +256,7 @@ export class View extends HTMLElement {
             await import('./paginator.js')
             this.renderer = document.createElement('foliate-paginator')
         }
-        this.renderer.setAttribute('exportparts', 'head,foot,filter')
+        this.renderer.setAttribute('exportparts', 'head,foot,filter,container')
         this.renderer.addEventListener('load', e => this.#onLoad(e.detail))
         this.renderer.addEventListener('relocate', e => this.#onRelocate(e.detail))
         this.renderer.addEventListener('create-overlayer', e =>
@@ -358,9 +358,19 @@ export class View extends HTMLElement {
                 Promise.resolve(this.#emit('external-link', { a, href }, true))
                     .then(x => x ? globalThis.open(href, '_blank') : null)
                     .catch(e => console.error(e))
-            else Promise.resolve(this.#emit('link', { a, href }, true))
-                .then(x => x ? this.goTo(href) : null)
-                .catch(e => console.error(e))
+            else {
+                let internalHref = href
+                if (!book.resolveHref(href)) {
+                    const hashIndex = href_.indexOf('#')
+                    if (hashIndex >= 0) {
+                        const hash = href_.slice(hashIndex)
+                        internalHref = section?.resolveHref?.(hash) ?? href
+                    }
+                }
+                Promise.resolve(this.#emit('link', { a, href: internalHref }, true))
+                    .then(x => x ? this.goTo(internalHref) : null)
+                    .catch(e => console.error(e))
+            }
         })
     }
     async addAnnotation(annotation, remove) {
@@ -402,7 +412,7 @@ export class View extends HTMLElement {
             .find(x => x.index === index && x.overlayer)
     }
     #createOverlayer({ doc, index }) {
-        const overlayer = new Overlayer()
+        const overlayer = new Overlayer(doc)
         doc.addEventListener('click', e => {
             const [value, range] = overlayer.hitTest(e)
             if (value && !value.startsWith(SEARCH_PREFIX)) {
@@ -577,11 +587,11 @@ export class View extends HTMLElement {
             for (const item of list) this.deleteAnnotation(item)
         this.#searchResults.clear()
     }
-    async initTTS(granularity = 'word', highlight) {
+    async initTTS(granularity = 'word', nodeFilter, highlighter) {
         const doc = this.renderer.getContents()[0].doc
         if (this.tts && this.tts.doc === doc) return
         const { TTS } = await import('./tts.js')
-        this.tts = new TTS(doc, textWalker, highlight || (range =>
+        this.tts = new TTS(doc, textWalker, nodeFilter, highlighter || (range =>
             this.renderer.scrollToAnchor(range, true)), granularity)
     }
     startMediaOverlay() {

commit 6b11e1744346f60504b727984f7d42f0fef3ab54
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sat Nov 29 06:39:57 2025 +0800

    Properly handle empty fragments for MOBI (#107)
---
 mobi.js | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

diff --git a/mobi.js b/mobi.js
index bbf6a1e..811b0d3 100644
--- a/mobi.js
+++ b/mobi.js
@@ -994,7 +994,7 @@ class KF8 {
             const last = arr[arr.length - 1]
             const fragStart = last?.fragEnd ?? 0, fragEnd = fragStart + skel.numFrag
             const frags = fragTable.slice(fragStart, fragEnd)
-            const length = skel.length + frags.map(f => f.length).reduce((a, b) => a + b)
+            const length = skel.length + frags.map(f => f.length).reduce((a, b) => a + b, 0)
             const totalLength = (last?.totalLength ?? 0) + length
             return arr.concat({ skel, frags, fragEnd, length, totalLength })
         }, [])

commit b1f72c0395b230f231715927ebf40bce0bde0177
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Tue Sep 23 23:22:33 2025 +0800

    Fixed multibyte characters in MOBI fragment selectors (#99)
---
 mobi.js | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

diff --git a/mobi.js b/mobi.js
index 4536be8..bbf6a1e 100644
--- a/mobi.js
+++ b/mobi.js
@@ -1212,7 +1212,7 @@ class KF8 {
         const frag = frags.find(frag => frag.index === fid)
         const offset = skel.offset + skel.length + frag.offset
         const fragRaw = await this.loadRaw(offset, offset + frag.length)
-        const str = this.mobi.decode(fragRaw).slice(off)
+        const str = this.mobi.decode(fragRaw.slice(off))
         const selector = getFragmentSelector(str)
         this.#setFragmentSelector(fid, off, selector)
         const anchor = doc => doc.querySelector(selector)

commit bdae4730125dcf9bdc5a5154cfb39de34b52013d
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sat Aug 2 07:44:52 2025 +0800

    Add custom event for loading manifest item (#76)
---
 epub.js | 7 +++++--
 1 file changed, 5 insertions(+), 2 deletions(-)

diff --git a/epub.js b/epub.js
index 4361557..12532eb 100644
--- a/epub.js
+++ b/epub.js
@@ -706,7 +706,6 @@ class Loader {
     #cache = new Map()
     #children = new Map()
     #refCount = new Map()
-    allowScript = false
     eventTarget = new EventTarget()
     constructor({ loadText, loadBlob, resources }) {
         this.loadText = loadText
@@ -765,7 +764,11 @@ class Loader {
         const { href, mediaType } = item
 
         const isScript = MIME.JS.test(item.mediaType)
-        if (isScript && !this.allowScript) return null
+        const detail = { type: mediaType, isScript, allow: true}
+        const event = new CustomEvent('load', { detail })
+        this.eventTarget.dispatchEvent(event)
+        const allow = await event.detail.allow
+        if (!allow) return null
 
         const parent = parents.at(-1)
         if (this.#cache.has(href)) return this.ref(href, parent)

commit 9fd2209b4d33fd759760a56cc8247cc9e29f03b4
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sat Aug 2 07:43:27 2025 +0800

    Fix blocked animate when running in background (#80)
---
 paginator.js | 8 ++++++++
 1 file changed, 8 insertions(+)

diff --git a/paginator.js b/paginator.js
index 6cf729f..7980c20 100644
--- a/paginator.js
+++ b/paginator.js
@@ -19,12 +19,20 @@ const easeOutQuad = x => 1 - (1 - x) * (1 - x)
 const animate = (a, b, duration, ease, render) => new Promise(resolve => {
     let start
     const step = now => {
+        if (document.hidden) {
+            render(lerp(a, b, 1))
+            return resolve()
+        }
         start ??= now
         const fraction = Math.min(1, (now - start) / duration)
         render(lerp(a, b, ease(fraction)))
         if (fraction < 1) requestAnimationFrame(step)
         else resolve()
     }
+    if (document.hidden) {
+        render(lerp(a, b, 1))
+        return resolve()
+    }
     requestAnimationFrame(step)
 })
 

commit 55c0027d111664ac4de8254f3b75df7b2a38a096
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sat Aug 2 07:19:23 2025 +0800

    Speed up text sectioning for large MOBI books (#92)
---
 mobi.js | 46 ++++++++++++++++++++++++++++++----------------
 1 file changed, 30 insertions(+), 16 deletions(-)

diff --git a/mobi.js b/mobi.js
index 939d6dd..4536be8 100644
--- a/mobi.js
+++ b/mobi.js
@@ -658,6 +658,15 @@ const getIndent = el => {
     return x
 }
 
+function rawBytesToString(uint8Array) {
+    const chunkSize = 0x8000
+    let result = ''
+    for (let i = 0; i < uint8Array.length; i += chunkSize) {
+        result += String.fromCharCode.apply(null, uint8Array.subarray(i, i + chunkSize))
+    }
+    return result
+}
+
 class MOBI6 {
     parser = new DOMParser()
     serializer = new XMLSerializer()
@@ -671,32 +680,37 @@ class MOBI6 {
         this.mobi = mobi
     }
     async init() {
+        const recordBuffers = []
+        for (let i = 0; i < this.mobi.headers.palmdoc.numTextRecords; i++) {
+            const buf = await this.mobi.loadText(i)
+            recordBuffers.push(buf)
+        }
+        const totalLength = recordBuffers.reduce((sum, buf) => sum + buf.byteLength, 0)
         // load all text records in an array
-        let array = new Uint8Array()
-        for (let i = 0; i < this.mobi.headers.palmdoc.numTextRecords; i++)
-            array = concatTypedArray(array, await this.mobi.loadText(i))
-
+        const array = new Uint8Array(totalLength)
+        recordBuffers.reduce((offset, buf) => {
+            array.set(new Uint8Array(buf), offset)
+            return offset + buf.byteLength
+        }, 0)
         // convert to string so we can use regex
         // note that `filepos` are byte offsets
         // so it needs to preserve each byte as a separate character
         // (see https://stackoverflow.com/q/50198017)
-        const str = Array.from(new Uint8Array(array),
-            c => String.fromCharCode(c)).join('')
+        const str = rawBytesToString(array)
 
         // split content into sections at each `<mbp:pagebreak>`
         this.#sections = [0]
             .concat(Array.from(str.matchAll(mbpPagebreakRegex), m => m.index))
-            .map((x, i, a) => str.slice(x, a[i + 1]))
-            // recover the original raw bytes
-            .map(str => Uint8Array.from(str, x => x.charCodeAt(0)))
-            .map(raw => ({ book: this, raw }))
+            .map((start, i, a) => {
+                const end = a[i + 1] ?? array.length
+                return { book: this, raw: array.subarray(start, end) }
+            })
             // get start and end filepos for each section
-            .reduce((arr, x) => {
-                const last = arr[arr.length - 1]
-                x.start = last?.end ?? 0
-                x.end = x.start + x.raw.byteLength
-                return arr.concat(x)
-            }, [])
+            .map((section, i, arr) => {
+                section.start = arr[i - 1]?.end ?? 0
+                section.end = section.start + section.raw.byteLength
+                return section
+            })
 
         this.sections = this.#sections.map((section, index) => ({
             id: index,

commit f1d4a4290da881745e2b0b24df8a62dc9c88fbd1
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Sat Aug 2 07:17:33 2025 +0800

    Fixed multibyte characters in MOBI fragment selectors (#91)
    
    For Chinese/CJK text, multibyte character offsets
    were being incorrectly used as bytes offsets after decoding
---
 mobi.js | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

diff --git a/mobi.js b/mobi.js
index 4917af6..939d6dd 100644
--- a/mobi.js
+++ b/mobi.js
@@ -1142,7 +1142,7 @@ class KF8 {
 
             const offsets = this.#fragmentOffsets.get(frag.index)
             if (offsets) for (const offset of offsets) {
-                const str = this.mobi.decode(fragRaw).slice(offset)
+                const str = this.mobi.decode(fragRaw.slice(offset))
                 const selector = getFragmentSelector(str)
                 this.#setFragmentSelector(frag.index, offset, selector)
             }

commit 0d4a92ae75b6524f9b75916e4a344298378532d4
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Tue Jun 17 01:28:18 2025 +0800

    Add optional highlight function when initializing TTS (#82)
---
 view.js | 6 +++---
 1 file changed, 3 insertions(+), 3 deletions(-)

diff --git a/view.js b/view.js
index 55c818f..23d8357 100644
--- a/view.js
+++ b/view.js
@@ -577,12 +577,12 @@ export class View extends HTMLElement {
             for (const item of list) this.deleteAnnotation(item)
         this.#searchResults.clear()
     }
-    async initTTS(granularity = 'word') {
+    async initTTS(granularity = 'word', highlight) {
         const doc = this.renderer.getContents()[0].doc
         if (this.tts && this.tts.doc === doc) return
         const { TTS } = await import('./tts.js')
-        this.tts = new TTS(doc, textWalker, range =>
-            this.renderer.scrollToAnchor(range, true), granularity)
+        this.tts = new TTS(doc, textWalker, highlight || (range =>
+            this.renderer.scrollToAnchor(range, true)), granularity)
     }
     startMediaOverlay() {
         const { index } = this.renderer.getContents()[0]

commit 4ee127d88f023e3b08659afd32970a40491c86e2
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Tue Jun 10 20:45:43 2025 +0800

    Textwalker with optional filter func parameter (#77)
---
 search.js      | 4 ++--
 text-walker.js | 4 ++--
 2 files changed, 4 insertions(+), 4 deletions(-)

diff --git a/search.js b/search.js
index cc889b4..a6f176f 100644
--- a/search.js
+++ b/search.js
@@ -109,7 +109,7 @@ export const search = (strs, query, options) => {
 }
 
 export const searchMatcher = (textWalker, opts) => {
-    const { defaultLocale, matchCase, matchDiacritics, matchWholeWords } = opts
+    const { defaultLocale, matchCase, matchDiacritics, matchWholeWords, acceptNode } = opts
     return function* (doc, query) {
         const iter = textWalker(doc, function* (strs, makeRange) {
             for (const result of search(strs, query, {
@@ -124,7 +124,7 @@ export const searchMatcher = (textWalker, opts) => {
                 result.range = makeRange(startIndex, startOffset, endIndex, endOffset)
                 yield result
             }
-        })
+        }, acceptNode)
         for (const result of iter) yield result
     }
 }
diff --git a/text-walker.js b/text-walker.js
index 3e2c44e..4ff9dff 100644
--- a/text-walker.js
+++ b/text-walker.js
@@ -27,9 +27,9 @@ const acceptNode = node => {
     return NodeFilter.FILTER_ACCEPT
 }
 
-export const textWalker = function* (x, func) {
+export const textWalker = function* (x, func, filterFunc) {
     const root = x.commonAncestorContainer ?? x.body ?? x
-    const walker = document.createTreeWalker(root, filter, { acceptNode })
+    const walker = document.createTreeWalker(root, filter, { acceptNode: filterFunc || acceptNode })
     const walk = x.commonAncestorContainer ? walkRange : walkDocument
     const nodes = walk(x, walker)
     const strs = nodes.map(node => node.nodeValue)

commit d7affcf96990641990bcfc39379fcc9223c85874
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Tue Jun 10 20:09:54 2025 +0800

    Create ID lookup cache for manifest (#75)
---
 epub.js | 3 ++-
 1 file changed, 2 insertions(+), 1 deletion(-)

diff --git a/epub.js b/epub.js
index ea6e91a..4361557 100644
--- a/epub.js
+++ b/epub.js
@@ -645,6 +645,7 @@ class Resources {
                 item.properties = item.properties?.split(/\s/)
                 return item
             })
+        this.manifestById = new Map(this.manifest.map(item => [item.id, item]))
         this.spine = $$itemref
             .map(getAttributes('idref', 'id', 'linear', 'properties'))
             .map(item => (item.properties = item.properties?.split(/\s/), item))
@@ -675,7 +676,7 @@ class Resources {
         this.cfis = CFI.fromElements($$itemref)
     }
     getItemByID(id) {
-        return this.manifest.find(item => item.id === id)
+        return this.manifestById.get(id)
     }
     getItemByHref(href) {
         return this.manifest.find(item => item.href === href)

commit f2d32152dfe26af22c2ea80762b1949403390365
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Tue Jun 10 18:43:34 2025 +0800

    Add transform target for KF8 files (#74)
---
 mobi.js | 10 ++++++++--
 1 file changed, 8 insertions(+), 2 deletions(-)

diff --git a/mobi.js b/mobi.js
index 116477d..4917af6 100644
--- a/mobi.js
+++ b/mobi.js
@@ -925,6 +925,7 @@ const getPageSpread = properties => {
 class KF8 {
     parser = new DOMParser()
     serializer = new XMLSerializer()
+    transformTarget = new EventTarget()
     #cache = new Map()
     #fragmentOffsets = new Map()
     #fragmentSelectors = new Map()
@@ -1071,8 +1072,13 @@ class KF8 {
             : await this.mobi.loadResource(id - 1)
         const result = [MIME.XHTML, MIME.HTML, MIME.CSS, MIME.SVG].includes(type)
             ? await this.replaceResources(this.mobi.decode(raw)) : raw
-        const doc = type === MIME.SVG ? this.parser.parseFromString(result, type) : null
-        return [new Blob([result], { type }),
+        const detail = { data: result, type }
+        const event = new CustomEvent('data', { detail })
+        this.transformTarget.dispatchEvent(event)
+        const newData = await event.detail.data
+        const newType = await event.detail.type
+        const doc = newType === MIME.SVG ? this.parser.parseFromString(newData, newType) : null
+        return [new Blob([newData], { newType }),
             // SVG wrappers need to be inlined
             // as browsers don't allow external resources when loading SVG as an image
             doc?.getElementsByTagNameNS('http://www.w3.org/2000/svg', 'image')?.length

commit 27f8b57d059f0d2c4080ff02f5bb2cda2ef512f5
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Thu Feb 13 08:52:03 2025 +0100

    Init view TTS with text segmentation granularity (#47)
    
    in order to support more TTS backends
    
    This PR also fixes a potential off-by-one error at the end boundary of the segment using `sentence` granularity.
---
 tts.js  | 8 ++++----
 view.js | 4 ++--
 2 files changed, 6 insertions(+), 6 deletions(-)

diff --git a/tts.js b/tts.js
index 0089ed3..dee3c57 100644
--- a/tts.js
+++ b/tts.js
@@ -34,10 +34,10 @@ const getSegmenter = (lang = 'en', granularity = 'word') => {
             while (sum <= index) sum += strs[++strIndex].length
             const startIndex = strIndex
             const startOffset = index - (sum - strs[strIndex].length)
-            const end = index + segment.length
+            const end = index + segment.length - 1
             if (end < str.length) while (sum <= end) sum += strs[++strIndex].length
             const endIndex = strIndex
-            const endOffset = end - (sum - strs[strIndex].length)
+            const endOffset = end - (sum - strs[strIndex].length) + 1
             yield [(name++).toString(),
                 makeRange(startIndex, startOffset, endIndex, endOffset)]
         }
@@ -207,11 +207,11 @@ export class TTS {
     #ranges
     #lastMark
     #serializer = new XMLSerializer()
-    constructor(doc, textWalker, highlight) {
+    constructor(doc, textWalker, highlight, granularity) {
         this.doc = doc
         this.highlight = highlight
         this.#list = new ListIterator(getBlocks(doc), range => {
-            const { entries, ssml } = getFragmentWithMarks(range, textWalker)
+            const { entries, ssml } = getFragmentWithMarks(range, textWalker, granularity)
             this.#ranges = new Map(entries)
             return [ssml, range]
         })
diff --git a/view.js b/view.js
index 17566ac..55c818f 100644
--- a/view.js
+++ b/view.js
@@ -577,12 +577,12 @@ export class View extends HTMLElement {
             for (const item of list) this.deleteAnnotation(item)
         this.#searchResults.clear()
     }
-    async initTTS() {
+    async initTTS(granularity = 'word') {
         const doc = this.renderer.getContents()[0].doc
         if (this.tts && this.tts.doc === doc) return
         const { TTS } = await import('./tts.js')
         this.tts = new TTS(doc, textWalker, range =>
-            this.renderer.scrollToAnchor(range, true))
+            this.renderer.scrollToAnchor(range, true), granularity)
     }
     startMediaOverlay() {
         const { index } = this.renderer.getContents()[0]

commit f24e611c4e00f8effdf7b83febd9860ac0915c1c
Author: Huang Xin <chrox.huang@gmail.com>
Date:   Fri Oct 18 12:05:31 2024 +0800

    Lazy loading of PDF documents (#37) (#38)
---
 pdf.js | 9 +++++++--
 1 file changed, 7 insertions(+), 2 deletions(-)

diff --git a/pdf.js b/pdf.js
index fc224f9..dbde8d9 100644
--- a/pdf.js
+++ b/pdf.js
@@ -105,9 +105,14 @@ const makeTOCItem = item => ({
 })
 
 export const makePDF = async file => {
-    const data = new Uint8Array(await file.arrayBuffer())
+    const transport = new pdfjsLib.PDFDataRangeTransport(file.size, [])
+    transport.requestDataRange = (begin, end) => {
+        file.slice(begin, end).arrayBuffer().then(chunk => {
+            transport.onDataRange(begin, chunk)
+        })
+    }
     const pdf = await pdfjsLib.getDocument({
-        data,
+        range: transport,
         cMapUrl: pdfjsPath('cmaps/'),
         standardFontDataUrl: pdfjsPath('standard_fonts/'),
         isEvalSupported: false,
