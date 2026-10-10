// Unknown /api/v1 paths get the API's JSON error shape instead of Next's HTML 404.
function notFound() {
  return Response.json({ error: 'NOT_FOUND', message: 'No such API endpoint. See /api/v1/docs.' }, { status: 404 });
}

export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
