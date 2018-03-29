const { suite, test } = intern.getPlugin('interface.tdd');
// const { assert } = intern.getPlugin('chai');

export default suite('drag', () => {
  test('Test 1', tst => {
    return tst.remote
      .get('http://localhost:9000/tests/data/elements.html')
      .findByXpath('id("b2")')
        .moveMouseTo(9, 9)
        .pressMouseButton(0)
        .moveMouseTo(10, 9)
        .end()
      .findByXpath('/HTML/BODY[1]')
        .moveMouseTo(32, 43)
        .releaseMouseButton(0);
  });
});
