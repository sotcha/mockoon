import {Tests} from 'test/lib/tests';
import {expect} from 'chai';

describe('Search a route', () => {
  const tests = new Tests('basic-data');

  it('Click should show input field', async () => {
    // Expect first to be hidden
    let hidden = await tests.helpers
      .getElementAttribute('app-routes-menu .search-route-wrapper .search-route', 'hidden');
    expect(hidden).to.not.null;

    await tests.helpers.elementClick('app-routes-menu .search-route-wrapper');
    // The input field should be visible
    hidden = await tests.helpers
      .getElementAttribute('app-routes-menu .search-route-wrapper .search-route', 'hidden');
    expect(hidden).to.null;

  });

  it('Setting a value to filter should show the correct routes', async () => {
    // When set text 'dolp'
    await tests.helpers.setElementValue('app-routes-menu .search-route-wrapper .search-route', 'dolp');
    // Then should contain only one route
    await tests.helpers.countRoutes(1);
  });

  it('Closing filter should show all routes', async () => {
    await tests.helpers.elementClick('app-routes-menu .search-route-wrapper .search-route-close');
    await tests.helpers.countRoutes(3);
  });

});
