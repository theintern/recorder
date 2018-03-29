const { suite, test } = intern.getPlugin('interface.tdd');

// Uncomment the line below to use chai's 'assert' interface.
// const { assert } = intern.getPlugin('chai');

// Export the suite to ensure that it's built as a module rather
// than a simple script.
export default suite('frame', () => {
  test('Test 1', tst => {
    return tst.remote
      .get('http://localhost:9000/tests/data/superframe.html')
      .switchToFrame(1)
      .switchToFrame(0)
      .findByXpath('id("b2")')
        .moveMouseTo(8, 11)
        .clickMouseButton(0)
        .end()
      .switchToFrame(<any>null)
      .switchToFrame(1)
      .switchToFrame(1)
      .findByXpath('/HTML/BODY[1]/P')
        .moveMouseTo(22, 27)
        .clickMouseButton(0);
  });
});
