// Test-only: the Contacts page on the real store and router, as App.tsx
// routes it. Only fetch is stubbed, by the caller (stubContactsApi).
/* eslint-disable react-refresh/only-export-components */
import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import authReducer from '../../features/auth/authSlice';
import customersReducer from '../../features/customers/customersSlice';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { ContactsAskLayout } from './ask/ContactsAskLayout';
import { ContactsListRedirect } from './ContactsListRedirect';
import { ContactsPage } from './ContactsPage';

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

/** The Contacts page on the real store and router. `ask` puts it under
 *  ContactsAskLayout, as App.tsx does, with the Navbar's actions slot beside
 *  it for the rail's pill (as `renderOrganizationPage` does with
 *  `OrganizationsAskLayout`). Only fetch is stubbed, by the caller
 *  (stubContactsApi, or stubContactsAsk with `ask`). */
export function renderContactsPage(url = '/contacts', { width = 1440, ask = false }: { width?: number; ask?: boolean } = {}) {
  setViewport(width);
  const store = configureStore({ reducer: { customers: customersReducer, auth: authReducer } });
  const page = (
    <Route
      path="/contacts/:id?"
      element={
        <>
          <ContactsPage />
          <Where />
        </>
      }
    />
  );
  const routes = (
    <Routes>
      <Route path="/contacts/list" element={<ContactsListRedirect />} />
      {ask ? <Route element={<ContactsAskLayout />}>{page}</Route> : page}
      <Route path="/organizations/:id" element={<Where />} />
      <Route path="/segments/new" element={<Where />} />
    </Routes>
  );
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        {ask ? <SlotHost bare>{routes}</SlotHost> : routes}
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}
