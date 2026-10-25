export function errorHandler(err, req, res, next) {
  console.error(`[${req.method} ${req.path}]`, err.message);
  if (res.headersSent) return next(err);
  let status = err.status || 500;
  let message = err.message;
  let origin = err.origin || `${req.method} ${req.path}`;
  if (err.code === 11000) {
    status = 409;
    message = 'Já existe um registro com esses dados ou esta ação já foi realizada.';
    origin = 'MongoDB / unicidade';
  }
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    status = 422;
    message = 'Dados inválidos. Verifique os campos e identificadores informados.';
    origin = 'MongoDB / validação';
  }
  if (err.name === 'MulterError') {
    status = 422;
    message = 'Anexo inválido. Envie um único arquivo de até 5 MB.';
    origin = 'Upload';
  }
  if (status >= 500)
    message = 'Não foi possível concluir a operação. Tente novamente ou contate o administrador.';
  res.status(status).json({ message, origin, redirect: '/dashboard' });
}
