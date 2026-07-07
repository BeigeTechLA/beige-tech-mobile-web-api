const { buildQuotesReportWorkbook } = require('../services/quotes-report.service');

exports.generateQuotesReport = async (req, res) => {
  try {
    const workbook = await buildQuotesReportWorkbook();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Quotes_SelfServe_Analysis.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Generate Quotes Report Error:', error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate quotes report',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    res.end();
  }
};
