/// <reference types="cypress" />

context('Actions', () => {
  beforeEach(() => {
    cy.visit('http://localhost:8080/e2e/pages/qr-camera/index.html');
  });

  describe('Instantiates Multi Format Reader', () => {
    it('has ZXing imported into window and creates instace', () => {
      cy.window().should('have.property', 'ZXing');
      cy.window().then((win) => {
        // call whatever you want on your app's window
        // so your app methods must be exposed somehow
        const codeReader = new win.ZXing.BrowserMultiFormatReader();
        expect(codeReader).to.not.be.null;
      });
    });
  });

});
