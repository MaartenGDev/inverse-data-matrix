import {BrowserCodeReader, BrowserDatamatrixCodeReader} from './src';

(window as any).BrowserDatamatrixCodeReader = new BrowserDatamatrixCodeReader();
(window as any).BrowserCodeReader = BrowserCodeReader;
