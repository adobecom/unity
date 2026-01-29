/*************************************************************************
* ADOBE CONFIDENTIAL
* ___________________
*
*  Copyright 2019 Adobe
*  All Rights Reserved.
*
* NOTICE:  All information contained herein is, and remains
* the property of Adobe and its suppliers, if any. The intellectual
* and technical concepts contained herein are proprietary to Adobe
* and its suppliers and are protected by all applicable intellectual
* property laws, including trade secret and copyright laws.
* Dissemination of this information or reproduction of this material
* is strictly forbidden unless prior written permission is obtained
* from Adobe.
**************************************************************************/

/* global __webpack_public_path__:true */
/* eslint no-unused-vars:0, camelcase:0, indent:0 */

'use strict';

import './wasm_exec.js';
import pdfliteWasm from './pdfliteWasm.js';

export default class DcPdflite {
    constructor() {
    }

    init() {
        if (window.pdflite !== undefined) {
            return Promise.resolve(this);
        }

        const go = new window.Go();

        return WebAssembly.instantiate(pdfliteWasm, go.importObject).then((result) => {
            console.log('pdflite.wasm loaded');
            go.run(result.instance);
            return this;
        });
    }

    _readFile(file) {
        return new Promise((resolve, reject) => {
            var fr = new FileReader();
            fr.onload = () => {
                resolve(fr.result )
            };
            fr.onerror = reject;
            fr.readAsArrayBuffer(file);
        });
    }

    fileDetails(file) {
        if (file.type != 'application/pdf') {
            throw 'Not a PDF';
        }

        return this._readFile(file).then(result => {
            let ubuf = new Uint8Array(result);
            let res = window.pdflite.pdfDetails(ubuf);
            if (res.error !== undefined) {
                throw res.error;
            }

            return res;
        });
    }

    pageDimensions(file, page) {
        if (file.type != 'application/pdf') {
            throw 'Not a PDF';
        }

        return this._readFile(file).then(result => {
            let ubuf = new Uint8Array(result);
            let res = window.pdflite.pageDimensions(ubuf, page);
            if (res.error !== undefined) {
                console.log("error:", res.error);
                throw res.error;
            }

            return res;
        });
    }
}
